import { Resend } from "resend";
import { sql } from "./database.js";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const fromAddress = process.env.NOTIFICATION_FROM_EMAIL ?? "USDCare <notifications@usdcare.app>";
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) { console.log(`[notify] Email skipped (no RESEND_API_KEY): to=${to} subject=${subject}`); return; }
  try { await resend.emails.send({ from: fromAddress, to, subject, html }); }
  catch (error) { console.error("[notify] Email send failed:", error); }
}

async function insertNotification(userId: string | null, orgId: string | null, title: string, message: string, linkUrl?: string) {
  if (!sql) return;
  try {
    await sql`insert into notifications (user_id, organization_id, title, message, link_url) values (${userId}, ${orgId}, ${title}, ${message}, ${linkUrl ?? null})`;
    console.log(`[notify] In-app notification created: ${title}`);
  } catch (error) {
    console.error("[notify] Failed to insert in-app notification:", error);
  }
}

function escrowLink(publicId: string) { return `${webOrigin}/escrow-pay/${publicId}`; }

// --- Lookup helpers ---

async function getAllPayerInfo(escrowId: string): Promise<Array<{ email: string | null; userId: string }>> {
  if (!sql) return [];
  return await sql`
    select distinct u.id as user_id, ap.email from treatment_escrows e
    join treatment_escrow_payers p on p.escrow_id = e.id
    join wallets w on lower(w.address) = lower(p.wallet_address)
    join users u on u.id = w.user_id
    left join account_profiles ap on ap.user_id = u.id
    where e.id = ${escrowId}`;
}

async function getProviderInfo(escrowId: string): Promise<{ email: string | null; orgId: string | null; publicId: string | null }> {
  if (!sql) return { email: null, orgId: null, publicId: null };
  const [row] = await sql`
    select e.organization_id, e.public_id, o.contact_email from treatment_escrows e
    join organizations o on o.id = e.organization_id
    where e.id = ${escrowId} limit 1`;
  return { email: row?.contact_email ?? null, orgId: row?.organization_id ?? null, publicId: row?.public_id ?? null };
}

async function getEscrowContext(escrowId: string) {
  if (!sql) return null;
  const [row] = await sql`
    select e.public_id, e.treatment_name, e.patient_reference, o.name as provider_name
    from treatment_escrows e join organizations o on o.id = e.organization_id
    where e.id = ${escrowId} limit 1`;
  return row ?? null;
}

// --- Notification functions ---

export async function notifyPayerEvidenceSubmitted(escrowId: string, milestoneLabel: string, evidenceDescription?: string) {
  const [payers, context] = await Promise.all([getAllPayerInfo(escrowId), getEscrowContext(escrowId)]);
  if (!context) return;

  const link = escrowLink(context.public_id as string);
  const title = "Evidence Submitted";
  const message = `${context.provider_name} submitted evidence for ${milestoneLabel} in ${context.treatment_name}. Please review and approve.`;

  for (const payer of payers) {
    await insertNotification(payer.userId, null, title, message, link);
    if (payer.email) {
      await sendEmail(payer.email, `Evidence submitted for ${milestoneLabel} — ${context.treatment_name}`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#0d2d27">Evidence Submitted</h2>
          <p><strong>${context.provider_name}</strong> has submitted evidence for <strong>${milestoneLabel}</strong> in care plan <strong>${context.treatment_name}</strong> (${context.patient_reference}).</p>
          ${evidenceDescription ? `<p style="background:#f8f5ef;padding:14px;border-radius:8px;border-left:3px solid #f59e0b"><em>"${evidenceDescription}"</em></p>` : ""}
          <p>Please review the evidence and approve or raise a dispute:</p>
          <p><a href="${link}" style="display:inline-block;background:#0d2d27;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Review Evidence</a></p>
          <p style="color:#708177;font-size:13px;margin-top:24px">If you did not request this treatment, please ignore this email.</p>
        </div>`);
    }
  }
}

export async function notifyProviderPayerApproved(escrowId: string, milestoneLabel: string) {
  const [provider, context] = await Promise.all([getProviderInfo(escrowId), getEscrowContext(escrowId)]);
  if (!context) return;

  const link = provider.publicId ? escrowLink(provider.publicId) : undefined;
  const title = "Milestone Approved ✓";
  const message = `The payer approved ${milestoneLabel} for ${context.treatment_name}. You can now release the funds.`;

  if (provider.orgId) await insertNotification(null, provider.orgId, title, message, link);

  if (provider.email) {
    await sendEmail(provider.email, `Payer approved ${milestoneLabel} — ${context.treatment_name}`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0d2d27">Milestone Approved ✓</h2>
        <p>The payer has approved <strong>${milestoneLabel}</strong> for care plan <strong>${context.treatment_name}</strong> (${context.patient_reference}).</p>
        <p>You can now release the milestone funds from the provider dashboard.</p>
        <p style="color:#708177;font-size:13px;margin-top:24px">USDCare — Transparent healthcare payments</p>
      </div>`);
  }
}

export async function notifyProviderDisputeRaised(escrowId: string, milestoneLabel: string, reason: string) {
  const [provider, context] = await Promise.all([getProviderInfo(escrowId), getEscrowContext(escrowId)]);
  if (!context) return;

  const link = provider.publicId ? escrowLink(provider.publicId) : undefined;
  const title = "⚠ Dispute Raised";
  const message = `The payer raised a dispute for ${milestoneLabel} in ${context.treatment_name}: "${reason}"`;

  if (provider.orgId) await insertNotification(null, provider.orgId, title, message, link);

  if (provider.email) {
    await sendEmail(provider.email, `Dispute raised for ${milestoneLabel} — ${context.treatment_name}`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#b91c1c">Dispute Raised</h2>
        <p>The payer has raised a dispute for <strong>${milestoneLabel}</strong> in care plan <strong>${context.treatment_name}</strong> (${context.patient_reference}).</p>
        <p style="background:#fef2f2;padding:14px;border-radius:8px;border-left:3px solid #ef4444"><strong>Reason:</strong> ${reason}</p>
        <p>Please review the concern and respond to the payer.</p>
        <p style="color:#708177;font-size:13px;margin-top:24px">USDCare — Transparent healthcare payments</p>
      </div>`);
  }
}

export async function notifyPayerFundsReleased(escrowId: string, milestoneLabel: string, amountUsdc: string) {
  const [payers, context] = await Promise.all([getAllPayerInfo(escrowId), getEscrowContext(escrowId)]);
  if (!context) return;

  const link = escrowLink(context.public_id as string);
  const title = "Funds Released";
  const message = `${amountUsdc} USDC released to ${context.provider_name} for ${milestoneLabel} in ${context.treatment_name}.`;

  for (const payer of payers) {
    await insertNotification(payer.userId, null, title, message, link);
    if (payer.email) {
      await sendEmail(payer.email, `Funds released for ${milestoneLabel} — ${context.treatment_name}`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#0d2d27">Milestone Released</h2>
          <p><strong>${amountUsdc} USDC</strong> has been released to <strong>${context.provider_name}</strong> for <strong>${milestoneLabel}</strong> in care plan <strong>${context.treatment_name}</strong>.</p>
          <p><a href="${link}" style="color:#147d92">View care plan status</a></p>
          <p style="color:#708177;font-size:13px;margin-top:24px">USDCare — Transparent healthcare payments</p>
        </div>`);
    }
  }
}
