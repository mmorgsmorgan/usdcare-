"use client";

import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { AlertCircle, AlertTriangle, Check, Copy, Download, ExternalLink, FileText, Search, ShieldCheck, WalletCards, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createPublicClient, decodeEventLog, encodeFunctionData, http, parseUnits, type Hash } from "viem";
import escrowArtifact from "./../contracts/USDCareTreatmentEscrow.json";
import escrowV2Artifact from "./../contracts/USDCareTreatmentEscrowV2.json";
import registryArtifact from "./../contracts/USDCareProviderRegistry.json";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const arcChainId = 5_042_002;
const escrowAddress = "0xe12a385b431240bcb5dca741c44fb861b9e1431f" as `0x${string}`;
const escrowV2Address = (process.env.NEXT_PUBLIC_ESCROW_V2_ADDRESS ?? "") as `0x${string}`;
const registryAddress = "0xfc050ccc0fb08fff6f8aa676668ad9ff97ca6d70" as `0x${string}`;
const usdcAddress = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const arcClient = createPublicClient({ transport: http("https://rpc.testnet.arc.io") });
const escrowAbi = escrowArtifact.abi as readonly unknown[];
const escrowV2Abi = escrowV2Artifact.abi as readonly unknown[];
const registryAbi = registryArtifact.abi as readonly unknown[];
const erc20Abi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
type MilestoneDispute = { id: string; reason: string; status: string; disputer_wallet: string; created_at: string };
type EscrowMilestone = { milestone_index: number; label: string; amount_minor: string; status: string; evidence_hash?: string; evidence_url?: string; evidence_description?: string; evidence_submitted_at?: string; payer_approval_count?: number; disputes?: MilestoneDispute[] };
type EscrowRequest = { public_id: string; payment_reference: string; provider_wallet: string; payer_wallet?: string | null; patient_approver_wallet?: string; approval_policy: string; total_minor: string; funded_minor?: string; released_minor?: string; required_payer_approvals?: number; status: string; patient_reference: string; treatment_name: string; provider_name: string; provider_type?: string; provider_country?: string; provider_address?: string; provider_website?: string; provider_contact_email?: string; provider_phone?: string; chain_escrow_id?: string; payer_transaction_hash?: string; milestones: EscrowMilestone[]; disputes?: MilestoneDispute[] };
type PayerIdentity = { wallet_address: string; display_name: string; email?: string; chain_caip2: string };

function milestoneStepClass(milestone: EscrowMilestone): string {
  if (milestone.status === "RELEASED") return "released";
  if (milestone.disputes?.some((d) => d.status === "OPEN")) return "disputed";
  if (milestone.status === "APPROVED") return "approved";
  if (milestone.status === "EVIDENCE_SUBMITTED" || milestone.evidence_hash) return "evidence-submitted";
  return "pending";
}

function milestoneStatusText(milestone: EscrowMilestone): string {
  if (milestone.status === "RELEASED") return "Released";
  if (milestone.disputes?.some((d) => d.status === "OPEN")) return "Dispute raised";
  if (milestone.status === "APPROVED") return "Payer approved";
  if (milestone.status === "EVIDENCE_SUBMITTED" || milestone.evidence_hash) return "⚠ Evidence submitted — Your review is required";
  return "Awaiting provider";
}

function MilestoneTimeline({ milestones, escrowDisputes, autoExpandIndex }: { milestones: EscrowMilestone[]; escrowDisputes?: MilestoneDispute[]; autoExpandIndex?: number }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(autoExpandIndex ?? null);
  const enriched = milestones.map((m) => ({
    ...m,
    disputes: [
      ...(m.disputes ?? []),
      ...(escrowDisputes ?? []).filter((d) => !m.disputes?.some((md) => md.id === d.id)),
    ].filter((d) => (d as MilestoneDispute & { milestone_index?: number }).milestone_index === undefined || (d as MilestoneDispute & { milestone_index?: number }).milestone_index === m.milestone_index),
  }));
  return (
    <div className="milestone-timeline">
      {enriched.map((milestone) => {
        const stepClass = milestoneStepClass(milestone);
        const hasEvidence = Boolean(milestone.evidence_hash);
        const isExpanded = expandedIndex === milestone.milestone_index;
        return (
          <div className={`milestone-timeline-step ${stepClass}`} key={milestone.milestone_index}>
            <div className="milestone-step-content">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <strong>{milestone.label}</strong>
                <span className="milestone-step-amount">{(Number(milestone.amount_minor) / 1_000_000).toFixed(2)} USDC</span>
              </div>
              <small>{milestoneStatusText(milestone)}</small>
              {hasEvidence && (
                <>
                  <button type="button" className="text-button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setExpandedIndex(isExpanded ? null : milestone.milestone_index)}>
                    <FileText size={13} /> {isExpanded ? "Hide evidence" : "View submitted evidence"}
                  </button>
                  {isExpanded && (
                    <div className="evidence-review-card">
                      <h4>Hospital Evidence</h4>
                      {milestone.evidence_description && (
                        <div className="evidence-detail">
                          <span className="evidence-detail-label">Description</span>
                          <span className="evidence-detail-value">{milestone.evidence_description}</span>
                        </div>
                      )}
                      {milestone.evidence_url && (
                        <div className="evidence-detail">
                          <span className="evidence-detail-label">Evidence document</span>
                          <span className="evidence-detail-value"><a href={milestone.evidence_url} target="_blank" rel="noreferrer">{milestone.evidence_url} <ExternalLink size={11} /></a></span>
                        </div>
                      )}
                      {milestone.evidence_hash && (
                        <div className="evidence-detail">
                          <span className="evidence-detail-label">Cryptographic hash</span>
                          <span className="evidence-detail-value mono">{milestone.evidence_hash.slice(0, 18)}...{milestone.evidence_hash.slice(-8)}</span>
                        </div>
                      )}
                      {milestone.evidence_submitted_at && (
                        <div className="evidence-detail">
                          <span className="evidence-detail-label">Submitted</span>
                          <span className="evidence-detail-value">{new Date(milestone.evidence_submitted_at).toLocaleString()}</span>
                        </div>
                      )}
                      {(milestone.disputes?.filter((d) => d.status === "OPEN").length ?? 0) > 0 && (
                        <div className="evidence-detail">
                          <span className="evidence-detail-label">Open disputes</span>
                          <span className="evidence-detail-value" style={{ color: "#b91c1c" }}>{milestone.disputes?.filter((d) => d.status === "OPEN").length} dispute(s) raised by payer</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PayerReviewSection({ request, current, publicId, busy, onApprove, onRefresh, getAccessToken, wallets }: { request: EscrowRequest; current: EscrowMilestone; publicId: string; busy: boolean; onApprove: () => void; onRefresh: (escrow: EscrowRequest) => void; getAccessToken: () => Promise<string | null>; wallets: ReturnType<typeof useWallets>["wallets"] }) {
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const hasOpenDispute = current.disputes?.some((d) => d.status === "OPEN");

  const submitDispute = async () => {
    setDisputeBusy(true); setDisputeError(null);
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Your Privy session expired. Sign in again.");
      const payerWallet = wallets.find((w) => w.address.toLowerCase() === (request.payer_wallet ?? "").toLowerCase()) ?? wallets[0];
      if (!payerWallet) throw new Error("Connect the payer wallet to submit a dispute.");
      const response = await fetch(`${apiUrl}/v1/escrow-payment-requests/${publicId}/milestones/${current.milestone_index}/dispute`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payerWalletAddress: payerWallet.address, reason: disputeReason }),
      });
      const body = await response.json().catch(() => null) as { escrow?: EscrowRequest; error?: string } | null;
      if (!response.ok || !body?.escrow) throw new Error(body?.error ?? "Dispute could not be submitted.");
      onRefresh(body.escrow);
      setDisputeReason(""); setShowDisputeForm(false);
    } catch (cause) { setDisputeError(cause instanceof Error ? cause.message : "Dispute submission failed."); } finally { setDisputeBusy(false); }
  };

  return (
    <section className="payer-review-section">
      <h3>Review submitted evidence</h3>
      <p>
        The hospital has submitted evidence for <strong>{current.label}</strong>.
        {current.evidence_description ? ` "${current.evidence_description}"` : " Review the milestone details above and choose to approve or dispute."}
      </p>
      {hasOpenDispute && (
        <div className="dispute-banner"><AlertTriangle size={16} /> You have raised a concern about this milestone. The provider has been notified.</div>
      )}
      {!hasOpenDispute && (
        <>
          <div className="review-actions">
            <button className="button button-primary" onClick={onApprove} disabled={busy}>{busy ? "Approving..." : <><ShieldCheck size={16} /> Approve milestone</>}</button>
            <button className="button button-danger-outline" onClick={() => setShowDisputeForm(!showDisputeForm)} disabled={busy}>Dispute this milestone</button>
          </div>
          {showDisputeForm && (
            <div className="dispute-form">
              <textarea className="dispute-textarea" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Describe why you believe this milestone evidence is incomplete or incorrect (minimum 10 characters)..." rows={4} />
              <button className="button button-danger dispute-submit" onClick={() => void submitDispute()} disabled={disputeBusy || disputeReason.trim().length < 10}>{disputeBusy ? "Submitting..." : "Submit dispute"}</button>
              {disputeError && <div className="form-error" role="alert"><AlertCircle size={14} /> {disputeError}</div>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function paymentErrorMessage(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause ?? "");
  const message = raw.toLowerCase();
  if (message.includes("only payer") || message.includes("payer can fund")) return "This wallet is not the payer assigned to this treatment request. Connect the assigned payer wallet, or clear the payer selection to fund from the connected wallet.";
  if (message.includes("user rejected") || message.includes("rejected the request")) return "The wallet request was cancelled. No funds were moved.";
  if (message.includes("insufficient allowance") || message.includes("allowance")) return "USDC approval was not sufficient. Approve the requested amount and try again.";
  if (message.includes("insufficient funds") || message.includes("insufficient balance")) return "The payer wallet does not have enough USDC or Arc Testnet gas to fund this treatment.";
  if (message.includes("provider is not verified") || message.includes("not verified on arc testnet")) return "This healthcare provider has not verified its settlement wallet on Arc Testnet yet. The hospital must verify that wallet before anyone can fund this request.";
  if (message.includes("not fundable") || message.includes("already funded")) return "This treatment funding request is no longer available for payment.";
  if (message.includes("patient") && message.includes("zero")) return "This request needs a valid patient approver wallet for its approval policy.";
  return raw || "Escrow funding failed. Check the payer wallet and try again.";
}

export function PublicEscrowPaymentRequest({ publicId }: { publicId: string }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const [request, setRequest] = useState<EscrowRequest | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payerInput, setPayerInput] = useState("");
  const [payerResults, setPayerResults] = useState<PayerIdentity[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<PayerIdentity | null>(null);
  const paymentUrl = typeof window === "undefined" ? `/escrow-pay/${publicId}` : window.location.href;
  const walletForAddress = (address: string) => wallets.find((item) => item.address.toLowerCase() === address.toLowerCase());
  const amount = useMemo(() => request ? `${(Number(request.total_minor) / 1_000_000).toFixed(2)} USDC` : "", [request]);

  const loadRequest = () => {
    fetch(`${apiUrl}/v1/escrow-payment-requests/${publicId}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Escrow payment request not found."); setRequest(body.escrow); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Escrow payment request could not be loaded."));
  };

  useEffect(() => { loadRequest(); }, [publicId]);
  useEffect(() => { if (!request || request.status === "DRAFT" || request.status === "COMPLETED") return; const id = window.setInterval(loadRequest, 30_000); return () => window.clearInterval(id); }, [publicId, request?.status]);
  useEffect(() => { if (request) QRCode.toDataURL(paymentUrl, { width: 260, margin: 1 }).then(setQr).catch(() => setError("QR code could not be generated.")); }, [paymentUrl, request]);
  useEffect(() => {
    const query = payerInput.trim();
    if (selectedPayer || query.length < 2 || /^0x[a-fA-F0-9]{40}$/.test(query)) { setPayerResults([]); return; }
    const timer = window.setTimeout(() => {
      fetch(`${apiUrl}/v1/payer-identities?q=${encodeURIComponent(query)}`).then(async (response) => {
        const body = await response.json() as { payers?: PayerIdentity[] };
        if (response.ok) setPayerResults(body.payers ?? []);
      }).catch(() => setPayerResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [payerInput, selectedPayer]);
  const copyLink = async () => { await navigator.clipboard?.writeText(paymentUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const pay = async () => {
    if (!request) return;
    if (!authenticated) { login(); return; }
    const requestedPayer = selectedPayer?.wallet_address ?? (payerInput.trim() || request.payer_wallet?.trim() || "");
    const wallet = walletForAddress(requestedPayer) ?? (requestedPayer ? undefined : wallets.find((item) => item.walletClientType === "privy" || item.walletClientType === "privy-v2") ?? wallets[0]);
    if (!wallet) { setError("Connect the payer wallet shown above to fund this treatment. If it is an external wallet, use Connect wallet first."); connectWallet(); return; }
    setBusy(true); setError(null);
    try {
      if (escrowV2Address && !request.chain_escrow_id) throw new Error("This care plan has not been activated onchain by the provider yet. Open the care plan in the provider workspace and activate it before funding.");
      if (escrowV2Address && request.chain_escrow_id) {
        await wallet.switchChain(arcChainId);
        const provider = await wallet.getEthereumProvider();
        const total = BigInt(request.total_minor);
        const approveHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: usdcAddress, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [escrowV2Address, total] }) }] }) as Hash;
        await arcClient.waitForTransactionReceipt({ hash: approveHash });
        const fundHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: escrowV2Address, data: encodeFunctionData({ abi: escrowV2Abi as any, functionName: "fundEscrow", args: [BigInt(request.chain_escrow_id), total] }) }] }) as Hash;
        await arcClient.waitForTransactionReceipt({ hash: fundHash });
        const response = await fetch(`${apiUrl}/v1/escrow-payment-requests/${publicId}/fund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payerWalletAddress: wallet.address, payerIdentityWallet: selectedPayer?.wallet_address, chainEscrowId: request.chain_escrow_id, transactionHash: fundHash }) });
        const body = await response.json().catch(() => null) as { escrow?: EscrowRequest; error?: string } | null;
        if (!response.ok || !body?.escrow) throw new Error(body?.error ?? "Funding could not be recorded.");
        setRequest(body.escrow);
        return;
      }
      const providerVerified = await arcClient.readContract({ address: registryAddress, abi: registryAbi as any, functionName: "verifiedProvider", args: [request.provider_wallet as `0x${string}`] }) as boolean;
      if (!providerVerified) throw new Error(`Provider wallet ${request.provider_wallet.slice(0, 6)}...${request.provider_wallet.slice(-4)} is not verified on Arc Testnet.`);
      await wallet.switchChain(arcChainId);
      const provider = await wallet.getEthereumProvider();
      const amounts = request.milestones.map((milestone) => BigInt(milestone.amount_minor));
      const payerAddress = selectedPayer?.wallet_address ?? payerInput.trim();
      if (payerAddress && !/^0x[a-fA-F0-9]{40}$/.test(payerAddress)) throw new Error("Enter a valid Arc Testnet payer wallet or select a registered payer.");
      if (payerAddress && payerAddress.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Connect the selected payer wallet before funding this treatment.");
      const patientApprover = request.patient_approver_wallet ?? "0x0000000000000000000000000000000000000000";
      if (request.approval_policy === "provider_and_patient" && !/^0x[a-fA-F0-9]{40}$/.test(patientApprover)) throw new Error("This request needs a patient approver wallet before it can be funded.");
      const createHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: escrowAddress, data: encodeFunctionData({ abi: escrowAbi as any, functionName: "createEscrow", args: [request.provider_wallet as `0x${string}`, patientApprover as `0x${string}`, request.approval_policy === "provider_and_patient" ? 1 : 0, amounts] }) }] }) as Hash;
      const receipt = await arcClient.waitForTransactionReceipt({ hash: createHash });
      let chainEscrowId: bigint | undefined;
      for (const log of receipt.logs) { try { const decoded = decodeEventLog({ abi: escrowAbi as any, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint } }; if (decoded.eventName === "EscrowCreated" && decoded.args?.escrowId !== undefined) chainEscrowId = decoded.args.escrowId; } catch { /* Ignore unrelated logs. */ } }
      if (chainEscrowId === undefined) throw new Error("The escrow was created but its ID could not be confirmed.");
      const total = amounts.reduce((sum, item) => sum + item, BigInt(0));
      const approveHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: usdcAddress, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [escrowAddress, total] }) }] }) as Hash;
      await arcClient.waitForTransactionReceipt({ hash: approveHash });
      const fundHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: escrowAddress, data: encodeFunctionData({ abi: escrowAbi as any, functionName: "fundEscrow", args: [chainEscrowId] }) }] }) as Hash;
      await arcClient.waitForTransactionReceipt({ hash: fundHash });
      const response = await fetch(`${apiUrl}/v1/escrow-payment-requests/${publicId}/fund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payerWalletAddress: wallet.address, payerIdentityWallet: selectedPayer?.wallet_address, chainEscrowId: String(chainEscrowId), transactionHash: fundHash }) });
      const body = await response.json().catch(() => null) as { escrow?: EscrowRequest; error?: string } | null;
      if (!response.ok || !body?.escrow) throw new Error(body?.error ?? "Funding could not be recorded.");
      setRequest(body.escrow);
    } catch (cause) { setError(paymentErrorMessage(cause)); } finally { setBusy(false); }
  };
  const approveCurrentMilestone = async () => {
    if (!request?.chain_escrow_id) return;
    const current = request.milestones.find((item) => item.status !== "RELEASED");
    if (!current) return;
    const wallet = wallets.find((item) => item.address.toLowerCase() === (request.payer_wallet ?? "").toLowerCase()) ?? wallets[0];
    if (!wallet) { setError("Connect the payer wallet that funded this treatment."); return; }
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Your Privy session expired. Sign in again.");
      await wallet.switchChain(arcChainId);
      const provider = await wallet.getEthereumProvider();
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: escrowV2Address, data: encodeFunctionData({ abi: escrowV2Abi as any, functionName: "approveMilestone", args: [BigInt(request.chain_escrow_id), BigInt(current.milestone_index)] }) }] }) as Hash;
      const receipt = await arcClient.waitForTransactionReceipt({ hash }); if (receipt.status !== "success") throw new Error("Arc rejected the payer approval.");
      const response = await fetch(`${apiUrl}/v1/escrow-payment-requests/${publicId}/milestones/${current.milestone_index}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ payerWalletAddress: wallet.address, transactionHash: hash }) });
      const body = await response.json().catch(() => null) as { escrow?: EscrowRequest; error?: string } | null; if (!response.ok || !body?.escrow) throw new Error(body?.error ?? "Approval could not be recorded.");
      setRequest(body.escrow);
    } catch (cause) { setError(paymentErrorMessage(cause)); } finally { setBusy(false); }
  };
  if (error && !request) return <main className="public-payment-page"><section className="public-payment-card"><AlertCircle size={25} /><h1>Escrow unavailable</h1><p>{error}</p></section></main>;
  if (!request) return <main className="public-payment-page"><section className="public-payment-card"><p>Loading treatment funding request...</p></section></main>;
  const funded = request.status === "FUNDED" || Boolean(request.payer_transaction_hash);
  const payerAddress = selectedPayer?.wallet_address ?? (payerInput.trim() || request.payer_wallet?.trim() || "");
  // When no payer is assigned, the connected wallet becomes the payer onchain.
  const payerValid = payerAddress.length === 0
    ? true
    : selectedPayer
      ? selectedPayer.chain_caip2 === "eip155:5042002"
      : /^0x[a-fA-F0-9]{40}$/.test(payerAddress);
  const currentMilestone = funded ? request.milestones.find((m) => m.status !== "RELEASED") : null;
  const currentHasEvidence = Boolean(currentMilestone?.evidence_hash);
  return <main className="public-payment-page"><section className="public-payment-card"><div className="public-payment-brand"><strong>USDCare</strong></div><div className="public-payment-heading"><div><span className="eyebrow">Treatment funding request</span><h1>{request.provider_name}</h1><p>{request.treatment_name} · {request.patient_reference}</p></div><span className={`status ${funded ? "success" : "warning"}`}>{funded ? "Funded" : "Awaiting payment"}</span></div><section className="funding-section treatment-section"><div className="funding-section-heading"><span className="eyebrow">Treatment</span><h2>{request.provider_name}</h2><p>{request.provider_type?.replaceAll("_", " ") ?? "Healthcare provider"}{request.provider_address ? ` · ${request.provider_address}` : ""}{request.provider_country ? `, ${request.provider_country}` : ""}</p><p className="treatment-patient">Patient reference: <strong>{request.patient_reference}</strong></p></div>{request.provider_contact_email && <a className="provider-contact" href={`mailto:${request.provider_contact_email}`}>{request.provider_contact_email}</a>}</section><section className="funding-section funding-summary-section"><div><span className="eyebrow">Funding summary</span><h2>Total to fund</h2></div><strong className="funding-total">{amount}</strong></section><section className="funding-section"><div className="funding-section-heading"><span className="eyebrow">Payment sessions</span><h2>Milestone schedule</h2><p>Funds are released as each treatment milestone is confirmed.</p></div><MilestoneTimeline milestones={request.milestones} escrowDisputes={request.disputes} autoExpandIndex={currentMilestone?.evidence_hash ? currentMilestone.milestone_index : undefined} /></section>{!funded && <section className="funding-section payer-section"><div className="funding-section-heading"><span className="eyebrow">Payer</span><h2>Who is paying for this treatment?</h2><p>Search a registered identity or enter the wallet that will fund this request.</p></div><div className="payer-search-wrap"><Search size={17} /><input aria-label="Search payer by name or wallet address" value={payerInput} onChange={(event) => { setPayerInput(event.target.value); setSelectedPayer(null); }} placeholder="Enter a name or wallet address" />{payerInput && <button type="button" className="icon-button" aria-label="Clear payer" onClick={() => { setPayerInput(""); setSelectedPayer(null); }}><X size={15} /></button>}{payerResults.length > 0 && <div className="payer-results">{payerResults.map((payer) => <button type="button" key={payer.wallet_address} onClick={() => { setSelectedPayer(payer); setPayerInput(payer.display_name); setPayerResults([]); }}><strong>{payer.display_name}</strong><small>{payer.email ? `${payer.email} · ` : ""}{payer.wallet_address.slice(0, 6)}...{payer.wallet_address.slice(-4)}</small></button>)}</div>}</div>{selectedPayer ? <div className="payer-verified"><div><strong>{selectedPayer.display_name}</strong><small>{selectedPayer.wallet_address.slice(0, 6)}...{selectedPayer.wallet_address.slice(-4)}</small></div><span><Check size={14} /> Payer verified</span></div> : /^0x[a-fA-F0-9]{40}$/.test(payerAddress) ? <div className="payer-verified"><div><strong>Wallet payer</strong><small>{payerAddress.slice(0, 6)}...{payerAddress.slice(-4)}</small></div><span><Check size={14} /> Wallet verified</span></div> : null}{payerAddress && !payerValid && <p className="payer-error">Wallet address is invalid.</p>}{selectedPayer && selectedPayer.chain_caip2 !== "eip155:5042002" && <p className="payer-error">This wallet is not supported for this treatment request.</p>}</section>}<section className="funding-section payment-link-section"><div className="funding-section-heading"><span className="eyebrow">Payment link</span><h2>Share this request</h2><p>Scan the QR code or copy the payment link to continue.</p></div><div className="payment-link-row"><input aria-label="Shareable escrow payment link" readOnly value={paymentUrl} /><button className="icon-button" aria-label="Copy payment link" onClick={() => void copyLink()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div><div className="payment-qr-block">{qr && <img className="payment-qr" src={qr} alt="QR code for this escrow payment request" />}<button className="text-button" onClick={() => qr && void (async () => { const link = document.createElement("a"); link.href = qr; link.download = `${request.payment_reference}-qr.png`; link.click(); })()} disabled={!qr}><Download size={15} /> Download QR</button></div></section>{!funded && <div className="public-payment-actions"><button className="button button-primary" onClick={() => void pay()} disabled={busy || !ready || !payerValid}>{busy ? "Creating and funding..." : authenticated ? <><WalletCards size={16} /> Fund treatment</> : "Connect wallet to fund"}</button></div>}{funded && <div className="public-payment-confirmed"><Check size={20} /><div><strong>Escrow funded — Milestone tracking active</strong><p>Funds are locked and will release as each treatment milestone is verified and approved.</p></div></div>}{funded && currentMilestone && currentHasEvidence && <PayerReviewSection request={request} current={currentMilestone} publicId={publicId} busy={busy} onApprove={() => void approveCurrentMilestone()} onRefresh={setRequest} getAccessToken={getAccessToken} wallets={wallets} />}{error && <div className="form-error" role="alert"><AlertCircle size={16} /> {error}</div>}</section></main>;
}
