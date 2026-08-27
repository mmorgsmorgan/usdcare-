import { createPublicClient, decodeEventLog, http, type Hash } from "viem";
import { InvoiceError } from "./repositories/invoices.js";

const arcClient = createPublicClient({ transport: http("https://rpc.testnet.arc.io") });

const escrowCreatedEvent = [{ type: "event", name: "EscrowCreated", inputs: [
  { name: "escrowId", type: "uint256", indexed: true },
  { name: "creator", type: "address", indexed: true },
  { name: "settlementWallet", type: "address", indexed: true },
  { name: "totalAmount", type: "uint256", indexed: false },
  { name: "payerCount", type: "uint256", indexed: false },
  { name: "requiredPayerApprovals", type: "uint256", indexed: false },
  { name: "openFunding", type: "bool", indexed: false },
], anonymous: false }] as const;

const escrowFundedEvent = [{ type: "event", name: "EscrowFunded", inputs: [
  { name: "escrowId", type: "uint256", indexed: true },
  { name: "payer", type: "address", indexed: true },
  { name: "amount", type: "uint256", indexed: false },
  { name: "fundedAmount", type: "uint256", indexed: false },
], anonymous: false }] as const;

const milestoneEvidenceEvent = [{ type: "event", name: "MilestoneEvidenceSubmitted", inputs: [
  { name: "escrowId", type: "uint256", indexed: true },
  { name: "milestoneId", type: "uint256", indexed: true },
  { name: "evidenceHash", type: "bytes32", indexed: true },
], anonymous: false }] as const;

const milestoneApprovedEvent = [{ type: "event", name: "MilestoneApproved", inputs: [
  { name: "escrowId", type: "uint256", indexed: true },
  { name: "milestoneId", type: "uint256", indexed: true },
  { name: "payer", type: "address", indexed: true },
], anonymous: false }] as const;

const milestoneReleasedEvent = [{ type: "event", name: "MilestoneReleased", inputs: [
  { name: "escrowId", type: "uint256", indexed: true },
  { name: "milestoneId", type: "uint256", indexed: true },
  { name: "amount", type: "uint256", indexed: false },
], anonymous: false }] as const;

export async function verifyEscrowCreation(txHash: string) {
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The escrow creation transaction failed on Arc Testnet.");
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: escrowCreatedEvent, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint; creator?: string; settlementWallet?: string; totalAmount?: bigint } };
      if (decoded.eventName === "EscrowCreated" && decoded.args?.escrowId !== undefined) {
        return { escrowId: String(decoded.args.escrowId), creator: String(decoded.args.creator).toLowerCase(), settlementWallet: String(decoded.args.settlementWallet).toLowerCase(), totalAmount: decoded.args.totalAmount! };
      }
    } catch { /* unrelated log */ }
  }
  throw new InvoiceError(400, "EscrowCreated event was not found in the transaction.");
}

export async function verifyEscrowFunding(txHash: string) {
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The escrow funding transaction failed on Arc Testnet.");
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: escrowFundedEvent, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint; payer?: string; amount?: bigint; fundedAmount?: bigint } };
      if (decoded.eventName === "EscrowFunded" && decoded.args?.escrowId !== undefined) {
        return { escrowId: String(decoded.args.escrowId), payer: String(decoded.args.payer).toLowerCase(), amount: decoded.args.amount!, fundedAmount: decoded.args.fundedAmount! };
      }
    } catch { /* unrelated log */ }
  }
  throw new InvoiceError(400, "EscrowFunded event was not found in the transaction.");
}

export async function verifyMilestoneEvidence(txHash: string) {
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The evidence submission transaction failed on Arc Testnet.");
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: milestoneEvidenceEvent, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint; milestoneId?: bigint; evidenceHash?: string } };
      if (decoded.eventName === "MilestoneEvidenceSubmitted" && decoded.args?.escrowId !== undefined) {
        return { escrowId: String(decoded.args.escrowId), milestoneId: Number(decoded.args.milestoneId), evidenceHash: String(decoded.args.evidenceHash) };
      }
    } catch { /* unrelated log */ }
  }
  throw new InvoiceError(400, "MilestoneEvidenceSubmitted event was not found in the transaction.");
}

export async function verifyMilestoneApproval(txHash: string) {
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The milestone approval transaction failed on Arc Testnet.");
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: milestoneApprovedEvent, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint; milestoneId?: bigint; payer?: string } };
      if (decoded.eventName === "MilestoneApproved" && decoded.args?.escrowId !== undefined) {
        return { escrowId: String(decoded.args.escrowId), milestoneId: Number(decoded.args.milestoneId), payer: String(decoded.args.payer).toLowerCase() };
      }
    } catch { /* unrelated log */ }
  }
  throw new InvoiceError(400, "MilestoneApproved event was not found in the transaction.");
}

export async function verifyMilestoneRelease(txHash: string) {
  let receipt;
  try { receipt = await arcClient.getTransactionReceipt({ hash: txHash as Hash }); }
  catch { throw new InvoiceError(400, "Transaction was not found on Arc Testnet."); }
  if (receipt.status !== "success") throw new InvoiceError(400, "The milestone release transaction failed on Arc Testnet.");
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: milestoneReleasedEvent, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint; milestoneId?: bigint; amount?: bigint } };
      if (decoded.eventName === "MilestoneReleased" && decoded.args?.escrowId !== undefined) {
        return { escrowId: String(decoded.args.escrowId), milestoneId: Number(decoded.args.milestoneId), amount: decoded.args.amount! };
      }
    } catch { /* unrelated log */ }
  }
  throw new InvoiceError(400, "MilestoneReleased event was not found in the transaction.");
}
