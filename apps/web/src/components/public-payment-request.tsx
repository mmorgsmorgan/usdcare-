"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { AlertCircle, Check, Copy, Download, ExternalLink, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { encodeFunctionData, type Hash } from "viem";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const arcChainId = 5_042_002;
const arcExplorerUrl = "https://testnet.arcscan.app";
const usdcAddress = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const erc20Abi = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
type PaymentRequest = { public_id: string; payment_reference: string; recipient_address: string; status: string; transaction_hash?: string; invoice_number: string; patient_reference: string; service_description: string; amount_minor: string; token_symbol: string; chain_caip2: string; provider_name: string; provider_type?: string; provider_country?: string; provider_address?: string; provider_website?: string; provider_contact_email?: string; provider_phone?: string };

export function PublicPaymentRequest({ publicId }: { publicId: string }) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const paymentUrl = typeof window === "undefined" ? `/pay/${publicId}` : window.location.href;
  const amount = useMemo(() => request ? `${(Number(request.amount_minor) / 1_000_000).toFixed(2)} ${request.token_symbol}` : "", [request]);
  const wallet = wallets.find((item) => item.walletClientType === "privy" || item.walletClientType === "privy-v2") ?? wallets[0];

  useEffect(() => { fetch(`${apiUrl}/v1/payment-requests/${publicId}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Payment request not found."); setRequest(body.paymentRequest); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Payment request could not be loaded.")); }, [publicId]);
  useEffect(() => { if (!request) return; QRCode.toDataURL(paymentUrl, { width: 260, margin: 1 }).then(setQr).catch(() => setError("QR code could not be generated.")); }, [paymentUrl, request]);
  const copyLink = async () => { await navigator.clipboard?.writeText(paymentUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const confirmWithRetry = async (hash: Hash) => {
    let lastError = "Payment confirmation is still pending.";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const token = await getAccessToken();
      const response = await fetch(`${apiUrl}/v1/payment-requests/${publicId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ transactionHash: hash, payerWalletAddress: wallet.address }) });
      const body = await response.json().catch(() => null) as { paymentRequest?: { status?: string }; error?: string } | null;
      if (response.ok) return body;
      lastError = body?.error ?? lastError;
      if (!/not found|pending|confirmation/i.test(lastError) && attempt > 1) throw new Error(lastError);
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error(lastError);
  };

  const pay = async () => {
    if (!request) return;
    if (!authenticated) { login(); return; }
    if (!wallet) { setError("Connect a wallet to pay this invoice."); return; }
    setPaying(true); setError(null);
    try {
      await wallet.switchChain(arcChainId);
      const provider = await wallet.getEthereumProvider();
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: usdcAddress, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [request.recipient_address as `0x${string}`, BigInt(request.amount_minor)] }) }] }) as Hash;
      await confirmWithRetry(hash);
      setRequest((current) => current ? { ...current, status: "CONFIRMED", transaction_hash: hash } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payment could not be completed."); } finally { setPaying(false); }
  };
  if (error && !request) return <main className="public-payment-page"><section className="public-payment-card"><AlertCircle size={25} /><h1>Payment request unavailable</h1><p>{error}</p></section></main>;
  if (!request) return <main className="public-payment-page"><section className="public-payment-card"><p>Loading payment request...</p></section></main>;
  const paid = ["PAID", "CONFIRMED", "RECEIPT_ISSUED"].includes(request.status);
  return <main className="public-payment-page"><section className="public-payment-card"><div className="public-payment-brand"><img src="/usdcare-mark.svg" alt="" /><strong>USDCare</strong></div><div className="public-payment-heading"><div><span className="eyebrow">Healthcare payment request</span><h1>{request.provider_name}</h1><p>{request.invoice_number} · {request.service_description}</p></div><span className={`status ${paid ? "success" : "warning"}`}>{paid ? "Paid" : "Awaiting payment"}</span></div><div className="provider-profile"><strong>{request.provider_type?.replaceAll("_", " ") ?? "Healthcare provider"}</strong>{request.provider_address && <p>{request.provider_address}{request.provider_country ? `, ${request.provider_country}` : ""}</p>}{!request.provider_address && request.provider_country && <p>{request.provider_country}</p>}<div>{request.provider_contact_email && <a href={`mailto:${request.provider_contact_email}`}>{request.provider_contact_email}</a>}{request.provider_phone && <a href={`tel:${request.provider_phone}`}>{request.provider_phone}</a>}{request.provider_website && <a href={request.provider_website} target="_blank" rel="noreferrer">Provider website <ExternalLink size={13} /></a>}</div></div><div className="public-payment-amount"><span>Amount due</span><strong>{amount}</strong></div><dl className="public-payment-details"><div><dt>Patient reference</dt><dd>{request.patient_reference}</dd></div><div><dt>Network</dt><dd>Arc Testnet</dd></div><div><dt>Settlement wallet</dt><dd className="mono">{request.recipient_address}</dd></div><div><dt>Payment reference</dt><dd className="mono">{request.payment_reference}</dd></div></dl><div className="payment-link-row"><input aria-label="Shareable payment link" readOnly value={paymentUrl} /><button className="icon-button" aria-label="Copy payment link" title="Copy payment link" onClick={() => void copyLink()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>{!paid && <div className="public-payment-actions"><button className="button button-primary" onClick={() => void pay()} disabled={paying || !ready}>{paying ? "Confirming..." : authenticated ? <><WalletCards size={16} /> Pay with wallet</> : "Connect wallet to pay"}</button>{qr && <img className="payment-qr" src={qr} alt="QR code for this payment request" />}<button className="text-button" onClick={() => qr && void (async () => { const link = document.createElement("a"); link.href = qr; link.download = `${request.invoice_number}-payment-qr.png`; link.click(); })()} disabled={!qr}><Download size={15} /> Download QR</button></div>}{paid && <div className="public-payment-confirmed"><Check size={20} /><div><strong>Payment confirmed</strong><p>{request.transaction_hash && <a href={`${arcExplorerUrl}/tx/${request.transaction_hash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={14} /></a>}</p></div></div>}{error && <div className="form-error" role="alert"><AlertCircle size={16} /> {error}</div>}</section></main>;
}
