import { randomUUID } from "node:crypto";
import { sql } from "../database.js";
import { arcProtocol } from "../config.js";
import { createPublicClient, decodeEventLog, http, type Hash } from "viem";
import type { CreateInvoiceInput } from "../schemas.js";

const ARC_TESTNET_CAIP2 = arcProtocol.chainCaip2;
const arcClient = createPublicClient({ transport: http("https://rpc.testnet.arc.io") });
const transferAbi = [{ type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }], anonymous: false }] as const;

export class InvoiceError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

function usdcToMinorUnits(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export async function createInvoice(privyUserId: string, organizationId: string, input: CreateInvoiceInput) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");

  return sql.begin(async (transaction) => {
    const [actor] = await transaction`
      select users.id
      from users
      join memberships on memberships.user_id = users.id
      where users.privy_user_id = ${privyUserId}
        and memberships.organization_id = ${organizationId}
        and memberships.role in ('administrator', 'finance')
      limit 1
    `;
    if (!actor) throw new InvoiceError(403, "You do not have permission to create invoices for this organization.");

    const [settlementWallet] = await transaction`
      select wallet_address
      from wallet_role_assignments
      where organization_id = ${organizationId}
        and role = 'settlement'
        and chain_caip2 = ${ARC_TESTNET_CAIP2}
      order by created_at desc
      limit 1
    `;
    if (!settlementWallet) throw new InvoiceError(409, "Connect an organization wallet before creating invoices.");

    const [invoice] = await transaction`
      insert into invoices (
        organization_id,
        created_by_user_id,
        patient_reference,
        service_description,
        amount_minor,
        chain_caip2,
        due_at
      ) values (
        ${organizationId},
        ${actor.id},
        ${input.patientReference},
        ${input.serviceDescription},
        ${usdcToMinorUnits(input.amountUsdc).toString()},
        ${ARC_TESTNET_CAIP2},
        ${input.dueAt ?? null}
      )
      returning id, invoice_number, patient_reference, service_description, amount_minor::text as amount_minor, token_symbol, chain_caip2, status, due_at, created_at
    `;
    if (!invoice) throw new InvoiceError(500, "Invoice creation failed.");

    const paymentReference = `CARE-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const [paymentRequest] = await transaction`
      insert into payment_requests (invoice_id, payment_reference, recipient_address, expires_at)
      values (${invoice.id}, ${paymentReference}, ${settlementWallet.wallet_address}, ${input.dueAt ?? null})
      returning public_id, payment_reference, recipient_address, status, expires_at
    `;

    return { ...invoice, paymentRequest };
  });
}

export async function listInvoices(privyUserId: string, organizationId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");

  const [membership] = await sql`
    select 1
    from users
    join memberships on memberships.user_id = users.id
    where users.privy_user_id = ${privyUserId}
      and memberships.organization_id = ${organizationId}
    limit 1
  `;
  if (!membership) throw new InvoiceError(403, "You do not have access to this organization.");

  return sql`
    select
      invoices.id,
      invoices.invoice_number,
      invoices.patient_reference,
      invoices.service_description,
      invoices.amount_minor::text as amount_minor,
      invoices.token_symbol,
      invoices.status,
      invoices.due_at,
      invoices.created_at,
      payment_requests.public_id,
      payment_requests.payment_reference,
      payment_requests.recipient_address,
      payment_requests.status as payment_status,
      payment_requests.transaction_hash
    from invoices
    join payment_requests on payment_requests.invoice_id = invoices.id
    where invoices.organization_id = ${organizationId}
    order by invoices.created_at desc
    limit 100
  `;
}

export async function getPublicPaymentRequest(publicId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");

  const [paymentRequest] = await sql`
    select
      payment_requests.public_id,
      payment_requests.payment_reference,
      payment_requests.recipient_address,
      payment_requests.status,
      payment_requests.expires_at,
      payment_requests.transaction_hash,
      payment_requests.confirmed_at,
      invoices.invoice_number,
      invoices.patient_reference,
      invoices.service_description,
      invoices.amount_minor::text as amount_minor,
      invoices.token_symbol,
      invoices.chain_caip2,
      organizations.name as provider_name,
      organizations.organization_type as provider_type,
      organizations.country as provider_country,
      organizations.address as provider_address,
      organizations.website as provider_website,
      organizations.contact_email as provider_contact_email,
      organizations.phone as provider_phone
    from payment_requests
    join invoices on invoices.id = payment_requests.invoice_id
    join organizations on organizations.id = invoices.organization_id
    where payment_requests.public_id = ${publicId}
    limit 1
  `;
  if (!paymentRequest) throw new InvoiceError(404, "Payment request not found.");
  return paymentRequest;
}

export async function confirmPublicPayment(publicId: string, transactionHash: string, payer?: { userId?: string; walletAddress?: string }) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [request] = await sql`
    select payment_requests.id, payment_requests.recipient_address, invoices.id as invoice_id,
      invoices.amount_minor::text as amount_minor, invoices.status
    from payment_requests join invoices on invoices.id = payment_requests.invoice_id
    where payment_requests.public_id = ${publicId}::uuid limit 1
  `;
  if (!request) throw new InvoiceError(404, "Payment request not found.");
  if (["PAID", "RECEIPT_ISSUED"].includes(request.status)) return { status: "PAID", transactionHash };
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: transactionHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The transaction failed on Arc Testnet.");
  const expectedAmount = BigInt(request.amount_minor);
  let payerWalletAddress: string | null = null;
  const matching = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== arcProtocol.usdcAddress.toLowerCase()) return false;
    try {
      const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      const to = String(decoded.args.to).toLowerCase();
      const from = String(decoded.args.from).toLowerCase();
      if (to === String(request.recipient_address).toLowerCase() && decoded.args.value === expectedAmount) {
        if (payer?.walletAddress && payer.walletAddress.toLowerCase() !== from) return false;
        payerWalletAddress = from;
        return true;
      }
      return false;
    } catch { return false; }
  });
  if (!matching) throw new InvoiceError(400, "This transaction does not match the invoice amount and settlement wallet.");

  let resolvedPayerUserId = payer?.userId ?? null;
  if (!resolvedPayerUserId && payerWalletAddress && typeof payerWalletAddress === "string") {
    const targetWallet: string = payerWalletAddress;
    const [foundUser] = await sql`
      select user_id from wallets where lower(address) = ${targetWallet.toLowerCase()} limit 1
    `;
    if (foundUser) resolvedPayerUserId = foundUser.user_id as string;
  }

  await sql.begin(async (transaction) => {
    await transaction`update invoices set status = 'PAID', updated_at = now() where id = ${request.invoice_id}`;
    await transaction`update payment_requests set status = 'CONFIRMED', transaction_hash = ${transactionHash}, confirmed_at = now(), updated_at = now() where id = ${request.id}`;
    await transaction`
      insert into payments (invoice_id, payment_request_id, payer_user_id, payer_wallet_address, transaction_hash, amount_minor, chain_caip2)
      values (${request.invoice_id}, ${request.id}, ${resolvedPayerUserId}, ${payerWalletAddress}, ${transactionHash}, ${request.amount_minor}, ${ARC_TESTNET_CAIP2})
      on conflict (transaction_hash) do update set payer_user_id = coalesce(payments.payer_user_id, excluded.payer_user_id)
    `;
  });
  return { status: "PAID", transactionHash };
}

export async function listPayerPayments(privyUserId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  return sql`
    select payments.id, payments.transaction_hash, payments.amount_minor::text as amount_minor,
      payments.token_symbol, payments.chain_caip2, payments.status, payments.confirmed_at,
      invoices.invoice_number, invoices.patient_reference, invoices.service_description,
      organizations.id as organization_id, organizations.name as provider_name,
      organizations.organization_type as provider_type, organizations.country as provider_country,
      organizations.address as provider_address
    from payments
    join invoices on invoices.id = payments.invoice_id
    join organizations on organizations.id = invoices.organization_id
    where exists (
      select 1 from users u
      left join wallets w on w.user_id = u.id
      where u.privy_user_id = ${privyUserId}
      and (
        payments.payer_user_id = u.id
        or (payments.payer_wallet_address is not null and lower(payments.payer_wallet_address) = lower(w.address))
      )
    )
    order by payments.confirmed_at desc
    limit 100
  `;
}
