import { randomUUID } from "node:crypto";
import { sql } from "../database.js";
import { InvoiceError } from "./invoices.js";
import { verifyEscrowCreation, verifyEscrowFunding, verifyMilestoneApproval, verifyMilestoneEvidence, verifyMilestoneRelease } from "../verify-escrow.js";
import { notifyPayerEvidenceSubmitted, notifyProviderPayerApproved, notifyProviderDisputeRaised, notifyPayerFundsReleased } from "../notifications.js";
import type { z } from "zod";
import type { createEscrowSchema } from "../schemas.js";

function minor(amount: string) { const [whole = "0", fraction = ""] = amount.split("."); return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0")); }
type Input = z.infer<typeof createEscrowSchema>;

export async function createEscrow(privyUserId: string, organizationId: string, input: Input) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const total = input.milestones.reduce((sum, item) => sum + minor(item.amountUsdc), 0n);
  return sql.begin(async (tx) => {
    const [actor] = await tx`select users.id from users join memberships on memberships.user_id = users.id where users.privy_user_id = ${privyUserId} and memberships.organization_id = ${organizationId} and memberships.role in ('administrator','finance') limit 1`;
    if (!actor) throw new InvoiceError(403, "You do not have permission to create escrows for this organization.");
    const [settlement] = await tx`select wallet_address from wallet_role_assignments where organization_id = ${organizationId} and role = 'settlement' order by created_at desc limit 1`;
    if (!settlement) throw new InvoiceError(409, "Connect an organization wallet before creating care plans.");
    const [row] = await tx`insert into treatment_escrows (organization_id, created_by_user_id, patient_reference, treatment_name, provider_wallet, payer_wallet, patient_approver_wallet, approval_policy, total_minor, payment_reference, open_funding, chain_escrow_id, create_tx_hash, status) values (${organizationId}, ${actor.id}, ${input.patientReference}, ${input.treatmentName}, ${String(settlement.wallet_address).toLowerCase()}, ${input.payerWallet?.toLowerCase() ?? null}, ${input.patientApproverWallet?.toLowerCase() ?? null}, ${input.approvalPolicy}, ${total.toString()}, ${`CARE-ESC-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`}, ${input.openFunding ?? !(input.payerWallets?.length || input.payerWallet)}, ${input.chainEscrowId ?? null}, ${input.createTransactionHash ?? null}, ${input.chainEscrowId ? "CREATED" : "DRAFT"}) returning *`;
    if (!row) throw new InvoiceError(500, "Escrow creation failed.");
    const payerWallets = [...new Set([...(input.payerWallets ?? []), ...(input.payerWallet ? [input.payerWallet] : [])].map((wallet) => wallet.toLowerCase()))];
    if (payerWallets.length) {
      await tx`update treatment_escrows set required_payer_approvals = ${input.requiredPayerApprovals ?? (input.approvalPolicy === "provider_and_patient" ? 1 : 0)} where id = ${row.id}`;
      for (const wallet of payerWallets) await tx`insert into treatment_escrow_payers (escrow_id, wallet_address) values (${row.id}, ${wallet}) on conflict do nothing`;
    }
    for (const [index, item] of input.milestones.entries()) await tx`insert into treatment_escrow_milestones (escrow_id, milestone_index, label, amount_minor) values (${row.id}, ${index}, ${item.label}, ${minor(item.amountUsdc).toString()})`;
    const [created] = await tx`select e.*, coalesce(json_agg(m order by m.milestone_index) filter (where m.id is not null), '[]') as milestones, coalesce((select json_agg(p order by p.created_at) from treatment_escrow_payers p where p.escrow_id = e.id), '[]') as payers from treatment_escrows e left join treatment_escrow_milestones m on m.escrow_id = e.id where e.organization_id = ${organizationId} and e.id = ${row.id} group by e.id`;
    if (!created) throw new InvoiceError(500, "Escrow creation could not be loaded after saving.");
    return created;
  });
}

export async function getPublicEscrowPaymentRequest(publicId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [row] = await sql`
    select e.public_id, e.payment_reference, e.provider_wallet, e.payer_wallet,
      e.patient_approver_wallet, e.approval_policy, e.total_minor::text as total_minor,
      e.released_minor::text as released_minor, e.funded_minor::text as funded_minor, e.required_payer_approvals,
      e.chain_escrow_id, e.status,
      e.payer_transaction_hash, e.chain_caip2, e.patient_reference, e.treatment_name,
      o.name as provider_name, o.organization_type as provider_type, o.country as provider_country,
      o.address as provider_address, o.website as provider_website, o.contact_email as provider_contact_email,
      o.phone as provider_phone,
      coalesce(json_agg(json_build_object(
        'milestone_index', m.milestone_index, 'label', m.label, 'amount_minor', m.amount_minor::text,
        'status', m.status, 'evidence_hash', m.evidence_hash, 'evidence_url', m.evidence_url,
        'evidence_description', m.evidence_description, 'evidence_submitted_at', m.evidence_submitted_at,
        'payer_approval_count', m.payer_approval_count, 'approve_tx_hash', m.approve_tx_hash,
        'release_tx_hash', m.release_tx_hash
      ) order by m.milestone_index) filter (where m.id is not null), '[]') as milestones,
      coalesce((select json_agg(p order by p.created_at) from treatment_escrow_payers p where p.escrow_id = e.id), '[]') as payers,
      coalesce((select json_agg(d order by d.created_at desc) from escrow_milestone_disputes d where d.escrow_id = e.id), '[]') as disputes
    from treatment_escrows e
    join organizations o on o.id = e.organization_id
    left join treatment_escrow_milestones m on m.escrow_id = e.id
    where e.public_id = ${publicId}::uuid
    group by e.id, o.id
    limit 1`;
  if (!row) throw new InvoiceError(404, "Escrow payment request not found.");
  return row;
}

export async function searchPayerIdentities(query: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  return sql`
    select distinct on (lower(w.address))
      w.address as wallet_address,
      coalesce(nullif(ap.display_name, ''), nullif(ap.email, ''), 'USDCare user') as display_name,
      ap.email,
      w.chain_caip2
    from wallets w
    join users u on u.id = w.user_id
    left join account_profiles ap on ap.user_id = u.id
    where w.chain_caip2 = 'eip155:5042002'
      and (lower(w.address) = ${normalized} or lower(ap.display_name) like ${`%${normalized}%`} or lower(ap.email) like ${`%${normalized}%`})
    order by lower(w.address), w.updated_at desc
    limit 8
  `;
}

export async function recordPublicEscrowFunding(publicId: string, payerWallet: string, chainEscrowId: string, transactionHash: string, identityWallet?: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  if (identityWallet) {
    const [identity] = await sql`select 1 from wallets where lower(address) = ${identityWallet.toLowerCase()} and chain_caip2 = 'eip155:5042002' limit 1`;
    if (!identity) throw new InvoiceError(400, "The selected payer identity does not have a verified Arc Testnet wallet.");
    if (identityWallet.toLowerCase() !== payerWallet.toLowerCase()) throw new InvoiceError(400, "The connected wallet does not match the selected payer identity.");
  }
  const verified = await verifyEscrowFunding(transactionHash);
  if (verified.payer.toLowerCase() !== payerWallet.toLowerCase()) throw new InvoiceError(400, "Transaction payer does not match the submitted wallet.");
  if (verified.escrowId !== chainEscrowId) throw new InvoiceError(400, "Transaction does not match the submitted escrow ID.");
  const [row] = await sql`update treatment_escrows set payer_wallet = ${payerWallet.toLowerCase()}, chain_escrow_id = ${chainEscrowId}, payer_transaction_hash = ${transactionHash}, fund_tx_hash = ${transactionHash}, funded_minor = total_minor, status = 'FUNDED', updated_at = now() where public_id = ${publicId}::uuid and status in ('DRAFT','CREATED') returning *`;
  if (!row) throw new InvoiceError(409, "This escrow is already funded or unavailable.");
  await sql`insert into treatment_escrow_payers (escrow_id, wallet_address) values (${row.id}, ${payerWallet.toLowerCase()}) on conflict do nothing`;
  return getPublicEscrowPaymentRequest(publicId);
}

export async function recordPublicEscrowApproval(privyUserId: string, publicId: string, milestoneIndex: number, payerWallet: string, transactionHash: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const normalizedWallet = payerWallet.toLowerCase();
  const [owned] = await sql`select 1 from wallets w join users u on u.id = w.user_id where u.privy_user_id = ${privyUserId} and lower(w.address) = ${normalizedWallet} and w.chain_caip2 = 'eip155:5042002' limit 1`;
  if (!owned) throw new InvoiceError(403, "The connected wallet is not linked to your USDCare account.");
  const [escrow] = await sql`select e.id from treatment_escrows e where e.public_id = ${publicId}::uuid and e.status = 'FUNDED' and (lower(e.payer_wallet) = ${normalizedWallet} or exists (select 1 from treatment_escrow_payers p where p.escrow_id = e.id and lower(p.wallet_address) = ${normalizedWallet})) limit 1`;
  if (!escrow) throw new InvoiceError(403, "This wallet is not a payer for this care plan.");
  const verified = await verifyMilestoneApproval(transactionHash);
  if (verified.payer.toLowerCase() !== normalizedWallet) throw new InvoiceError(400, "Transaction payer does not match the connected wallet.");
  if (verified.milestoneId !== milestoneIndex) throw new InvoiceError(400, "Transaction does not match the submitted milestone.");
  const [milestone] = await sql`update treatment_escrow_milestones set approve_tx_hash = ${transactionHash}, payer_approval_count = payer_approval_count + 1, status = 'APPROVED' where escrow_id = ${escrow.id} and milestone_index = ${milestoneIndex} and evidence_hash is not null and status <> 'RELEASED' returning id, label`;
  if (!milestone) throw new InvoiceError(409, "This milestone is unavailable or its evidence has not been submitted.");
  void notifyProviderPayerApproved(escrow.id as string, milestone.label as string);
  return getPublicEscrowPaymentRequest(publicId);
}

export async function listEscrows(privyUserId: string, organizationId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [member] = await sql`select 1 from users join memberships on memberships.user_id = users.id where users.privy_user_id = ${privyUserId} and memberships.organization_id = ${organizationId} limit 1`;
  if (!member) throw new InvoiceError(403, "You do not have access to this organization.");
  return sql`select e.*, coalesce(json_agg(m order by m.milestone_index) filter (where m.id is not null), '[]') as milestones, coalesce((select json_agg(p order by p.created_at) from treatment_escrow_payers p where p.escrow_id = e.id), '[]') as payers from treatment_escrows e left join treatment_escrow_milestones m on m.escrow_id = e.id where e.organization_id = ${organizationId} group by e.id order by e.created_at desc limit 100`;
}

export async function listPayerEscrows(privyUserId: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  return sql`
    select e.*,
      coalesce(json_agg(m order by m.milestone_index) filter (where m.id is not null), '[]') as milestones,
      coalesce((select json_agg(p order by p.created_at) from treatment_escrow_payers p where p.escrow_id = e.id), '[]') as payers
    from treatment_escrows e
    left join treatment_escrow_milestones m on m.escrow_id = e.id
    where exists (
      select 1 from wallets w
      join users u on u.id = w.user_id
      left join treatment_escrow_payers p on p.wallet_address = lower(w.address)
      where u.privy_user_id = ${privyUserId}
      and (lower(e.payer_wallet) = lower(w.address) or p.escrow_id = e.id)
    )
    group by e.id order by e.created_at desc limit 100
  `;
}

export async function getEscrow(organizationId: string, id: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [row] = await sql`select e.*, coalesce(json_agg(m order by m.milestone_index) filter (where m.id is not null), '[]') as milestones, coalesce((select json_agg(p order by p.created_at) from treatment_escrow_payers p where p.escrow_id = e.id), '[]') as payers from treatment_escrows e left join treatment_escrow_milestones m on m.escrow_id = e.id where e.organization_id = ${organizationId} and e.id = ${id} group by e.id`;
  if (!row) throw new InvoiceError(404, "Escrow not found.");
  return row;
}

export async function recordEscrowAction(privyUserId: string, id: string, input: { action: string; chainEscrowId?: string; transactionHash: string; milestoneIndex?: number; evidenceHash?: string; evidenceUrl?: string; evidenceDescription?: string }) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [actor] = await sql`select users.id, memberships.organization_id from users join memberships on memberships.user_id = users.id join treatment_escrows e on e.organization_id = memberships.organization_id where users.privy_user_id = ${privyUserId} and e.id = ${id} limit 1`;
  if (!actor) throw new InvoiceError(403, "You do not have access to this escrow.");
  if (input.action === "create") {
    const verified = await verifyEscrowCreation(input.transactionHash);
    if (input.chainEscrowId && verified.escrowId !== input.chainEscrowId) throw new InvoiceError(400, "Transaction does not match the submitted escrow ID.");
    await sql`update treatment_escrows set chain_escrow_id = ${verified.escrowId}, create_tx_hash = ${input.transactionHash}, status = 'CREATED', updated_at = now() where id = ${id}`;
  }
  if (input.action === "fund") {
    await verifyEscrowFunding(input.transactionHash);
    await sql`update treatment_escrows set fund_tx_hash = ${input.transactionHash}, status = 'FUNDED', updated_at = now() where id = ${id}`;
  }
  if (input.action === "evidence" && input.milestoneIndex !== undefined) {
    const verified = await verifyMilestoneEvidence(input.transactionHash);
    if (input.evidenceHash && verified.evidenceHash.toLowerCase() !== input.evidenceHash.toLowerCase()) throw new InvoiceError(400, "Transaction evidence hash does not match the submitted evidence.");
    const [ms] = await sql`update treatment_escrow_milestones set evidence_hash = ${input.evidenceHash ?? null}, evidence_url = ${input.evidenceUrl ?? null}, evidence_description = ${input.evidenceDescription ?? null}, evidence_submitted_at = now(), status = 'EVIDENCE_SUBMITTED' where escrow_id = ${id} and milestone_index = ${input.milestoneIndex} returning label`;
    if (ms) void notifyPayerEvidenceSubmitted(id, ms.label as string, input.evidenceDescription);
  }
  if (input.action === "approve" && input.milestoneIndex !== undefined) {
    await verifyMilestoneApproval(input.transactionHash);
    const [ms] = await sql`update treatment_escrow_milestones set approve_tx_hash = ${input.transactionHash}, payer_approval_count = payer_approval_count + 1, status = 'APPROVED' where escrow_id = ${id} and milestone_index = ${input.milestoneIndex} returning label`;
    if (ms) void notifyProviderPayerApproved(id, ms.label as string);
  }
  if (input.action === "release" && input.milestoneIndex !== undefined) {
    await verifyMilestoneRelease(input.transactionHash);
    const milestoneIndex = input.milestoneIndex;
    let releasedLabel = ""; let releasedAmount = "";
    await sql.begin(async (tx) => {
      const [milestone] = await tx`update treatment_escrow_milestones set release_tx_hash = ${input.transactionHash}, status = 'RELEASED' where escrow_id = ${id} and milestone_index = ${milestoneIndex} and status <> 'RELEASED' returning amount_minor, label`;
      if (!milestone) throw new InvoiceError(409, "This milestone has already been released or is unavailable.");
      releasedLabel = milestone.label as string; releasedAmount = (Number(milestone.amount_minor) / 1_000_000).toFixed(2);
      const [remaining] = await tx`select 1 from treatment_escrow_milestones where escrow_id = ${id} and status <> 'RELEASED' limit 1`;
      await tx`update treatment_escrows set released_minor = released_minor + ${String(milestone.amount_minor)}::bigint, status = ${remaining ? "FUNDED" : "COMPLETED"}, updated_at = now() where id = ${id}`;
    });
    if (releasedLabel) void notifyPayerFundsReleased(id, releasedLabel, releasedAmount);
  }
  return getEscrow(actor.organization_id as string, id);
}

export async function getEscrowMilestoneEvidence(publicId: string, milestoneIndex: number) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const [row] = await sql`
    select m.milestone_index, m.label, m.amount_minor::text as amount_minor, m.status,
      m.evidence_hash, m.evidence_url, m.evidence_description, m.evidence_submitted_at,
      m.payer_approval_count, m.approve_tx_hash, m.release_tx_hash,
      coalesce((select json_agg(d order by d.created_at desc) from escrow_milestone_disputes d where d.escrow_id = m.escrow_id and d.milestone_index = m.milestone_index), '[]') as disputes
    from treatment_escrow_milestones m
    join treatment_escrows e on e.id = m.escrow_id
    where e.public_id = ${publicId}::uuid and m.milestone_index = ${milestoneIndex}
    limit 1`;
  if (!row) throw new InvoiceError(404, "Milestone not found.");
  return row;
}

export async function submitMilestoneDispute(privyUserId: string, publicId: string, milestoneIndex: number, payerWallet: string, reason: string) {
  if (!sql) throw new InvoiceError(503, "Database is not configured.");
  const normalizedWallet = payerWallet.toLowerCase();
  const [user] = await sql`select id from users where privy_user_id = ${privyUserId} limit 1`;
  if (!user) throw new InvoiceError(403, "User not found.");
  const [escrow] = await sql`
    select e.id from treatment_escrows e
    where e.public_id = ${publicId}::uuid and e.status = 'FUNDED'
      and (lower(e.payer_wallet) = ${normalizedWallet}
        or exists (select 1 from treatment_escrow_payers p where p.escrow_id = e.id and lower(p.wallet_address) = ${normalizedWallet}))
    limit 1`;
  if (!escrow) throw new InvoiceError(403, "This wallet is not a payer for this care plan.");
  const [milestone] = await sql`select label from treatment_escrow_milestones where escrow_id = ${escrow.id} and milestone_index = ${milestoneIndex} and evidence_hash is not null and status <> 'RELEASED' limit 1`;
  if (!milestone) throw new InvoiceError(409, "Evidence has not been submitted for this milestone or it has already been released.");
  const [existing] = await sql`select 1 from escrow_milestone_disputes where escrow_id = ${escrow.id} and milestone_index = ${milestoneIndex} and disputer_user_id = ${user.id} and status = 'OPEN' limit 1`;
  if (existing) throw new InvoiceError(409, "You have already submitted a dispute for this milestone.");
  await sql`insert into escrow_milestone_disputes (escrow_id, milestone_index, disputer_user_id, disputer_wallet, reason) values (${escrow.id}, ${milestoneIndex}, ${user.id}, ${normalizedWallet}, ${reason})`;
  void notifyProviderDisputeRaised(escrow.id as string, milestone.label as string, reason);
  return getPublicEscrowPaymentRequest(publicId);
}
