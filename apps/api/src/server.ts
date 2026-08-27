import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { arcProtocol, config, readiness } from "./config.js";
import { checkDatabase, sql } from "./database.js";
import { assertPrivyWalletOwnership, AuthError, verifyPrivyAccessToken } from "./privy.js";
import { ensureUser, getOnboardingStatus, saveOnboarding } from "./repositories/onboarding.js";
import { confirmPublicPayment, createInvoice, getPublicPaymentRequest, InvoiceError, listInvoices, listPayerPayments } from "./repositories/invoices.js";
import { createInvoiceSchema, onboardingSchema, organizationParamsSchema, paymentRequestParamsSchema } from "./schemas.js";
import { isTransactionHash } from "./payment-utils.js";
import { createEscrow, getPublicEscrowPaymentRequest, listEscrows, listPayerEscrows, recordEscrowAction, recordPublicEscrowApproval, recordPublicEscrowFunding, searchPayerIdentities, getEscrowMilestoneEvidence, submitMilestoneDispute } from "./repositories/escrows.js";
import { createEscrowSchema, escrowActionSchema, escrowParamsSchema, escrowPublicParamsSchema, disputeSchema } from "./schemas.js";
import { getNotifications, markNotificationsRead } from "./repositories/notifications.js";

const app = Fastify({ logger: true, requestIdHeader: "x-request-id" });

await app.register(cors, {
  origin: config.WEB_ORIGIN,
  methods: ["GET", "POST", "OPTIONS"],
});

app.get("/health", async () => ({
  service: "usdcare-api",
  status: "ok",
  timestamp: new Date().toISOString(),
}));

app.get("/v1/protocol", async () => ({
  network: "Arc Testnet",
  ...arcProtocol,
}));

app.get("/ready", async (_, reply) => {
  const database = await checkDatabase();
  const ready = readiness.privy && database;
  return reply.code(ready ? 200 : 503).send({
    ready,
    checks: { privy: readiness.privy, database },
  });
});

app.get("/v1/me", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  await ensureUser(claims.user_id);
  const onboarding = await getOnboardingStatus(claims.user_id);
  return {
    privyUserId: claims.user_id,
    sessionId: claims.session_id,
    expiresAt: claims.expiration,
    ...onboarding,
  };
});

app.post("/v1/onboarding", async (request, reply) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const input = onboardingSchema.parse(request.body);
  const identityToken = request.headers["x-privy-identity-token"];
  await assertPrivyWalletOwnership(
    claims.user_id,
    typeof identityToken === "string" ? identityToken : undefined,
    input.wallets.map((wallet) => wallet.address),
  );

  try {
    const result = await saveOnboarding(claims.user_id, input);
    return reply.code(201).send({ ...result, status: "onboarded" });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
      return reply.code(503).send({ error: "Database is not configured." });
    }
    throw error;
  }
});

app.get("/v1/organizations/:organizationId/invoices", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const invoices = await listInvoices(claims.user_id, organizationId);
  return { invoices };
});

app.post("/v1/organizations/:organizationId/invoices", async (request, reply) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const input = createInvoiceSchema.parse(request.body);
  const invoice = await createInvoice(claims.user_id, organizationId, input);
  return reply.code(201).send({ invoice });
});

app.get("/v1/organizations/:organizationId/escrows", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  return { escrows: await listEscrows(claims.user_id, organizationId) };
});

app.post("/v1/organizations/:organizationId/escrows", async (request, reply) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { organizationId } = organizationParamsSchema.parse(request.params);
  return reply.code(201).send({ escrow: await createEscrow(claims.user_id, organizationId, createEscrowSchema.parse(request.body)) });
});

app.post("/v1/escrows/:escrowId/actions", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { escrowId } = escrowParamsSchema.parse(request.params);
  return { escrow: await recordEscrowAction(claims.user_id, escrowId, escrowActionSchema.parse(request.body)) };
});

app.get("/v1/escrow-payment-requests/:publicId", async (request) => {
  const { publicId } = escrowPublicParamsSchema.parse(request.params);
  return { escrow: await getPublicEscrowPaymentRequest(publicId) };
});

app.get("/v1/payer-identities", async (request) => {
  const query = typeof (request.query as { q?: unknown })?.q === "string" ? (request.query as { q: string }).q : "";
  return { payers: await searchPayerIdentities(query) };
});

app.post("/v1/escrow-payment-requests/:publicId/fund", async (request) => {
  const { publicId } = escrowPublicParamsSchema.parse(request.params);
  const body = request.body as { payerWalletAddress?: string; payerIdentityWallet?: string; chainEscrowId?: string; transactionHash?: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(body?.payerWalletAddress ?? "") || !/^\d+$/.test(body?.chainEscrowId ?? "") || !isTransactionHash(body?.transactionHash)) {
    throw new InvoiceError(400, "A valid payer wallet, escrow ID, and transaction hash are required.");
  }
  const payerWalletAddress = body.payerWalletAddress as string;
  const chainEscrowId = body.chainEscrowId as string;
  const transactionHash = body.transactionHash as `0x${string}`;
  return { escrow: await recordPublicEscrowFunding(publicId, payerWalletAddress, chainEscrowId, transactionHash, body.payerIdentityWallet) };
});

app.post("/v1/escrow-payment-requests/:publicId/milestones/:milestoneIndex/approve", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { publicId } = escrowPublicParamsSchema.parse(request.params);
  const milestoneIndex = Number((request.params as { milestoneIndex?: string }).milestoneIndex);
  const body = request.body as { payerWalletAddress?: string; transactionHash?: string };
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || !/^0x[a-fA-F0-9]{40}$/.test(body?.payerWalletAddress ?? "") || !isTransactionHash(body?.transactionHash)) {
    throw new InvoiceError(400, "A valid milestone, payer wallet, and transaction hash are required.");
  }
  return { escrow: await recordPublicEscrowApproval(claims.user_id, publicId, milestoneIndex, body.payerWalletAddress as string, body.transactionHash as string) };
});

app.get("/v1/escrow-payment-requests/:publicId/milestones/:milestoneIndex/evidence", async (request) => {
  const { publicId } = escrowPublicParamsSchema.parse(request.params);
  const milestoneIndex = Number((request.params as { milestoneIndex?: string }).milestoneIndex);
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) throw new InvoiceError(400, "Invalid milestone index.");
  return { evidence: await getEscrowMilestoneEvidence(publicId, milestoneIndex) };
});

app.post("/v1/escrow-payment-requests/:publicId/milestones/:milestoneIndex/dispute", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const { publicId } = escrowPublicParamsSchema.parse(request.params);
  const milestoneIndex = Number((request.params as { milestoneIndex?: string }).milestoneIndex);
  if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0) throw new InvoiceError(400, "Invalid milestone index.");
  const body = request.body as { payerWalletAddress?: string; reason?: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(body?.payerWalletAddress ?? "")) throw new InvoiceError(400, "A valid payer wallet is required.");
  const { reason } = disputeSchema.parse({ reason: body?.reason });
  return { escrow: await submitMilestoneDispute(claims.user_id, publicId, milestoneIndex, body.payerWalletAddress as string, reason) };
});

app.get("/v1/payment-requests/:publicId", async (request) => {
  const { publicId } = paymentRequestParamsSchema.parse(request.params);
  return { paymentRequest: await getPublicPaymentRequest(publicId) };
});

app.post("/v1/payment-requests/:publicId/confirm", async (request) => {
  const { publicId } = paymentRequestParamsSchema.parse(request.params);
  const body = request.body as { transactionHash?: string; payerWalletAddress?: string };
  if (!isTransactionHash(body?.transactionHash)) throw new InvoiceError(400, "A valid transaction hash is required.");
  let payer: { userId?: string; walletAddress?: string } = {};
  if (request.headers.authorization) {
    const claims = await verifyPrivyAccessToken(request.headers.authorization);
    const user = await ensureUser(claims.user_id);
    payer = { userId: user.id as string, walletAddress: body.payerWalletAddress };
  }
  return { paymentRequest: await confirmPublicPayment(publicId, body.transactionHash, payer) };
});

app.get("/v1/me/payments", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  return { payments: await listPayerPayments(claims.user_id) };
});

app.get("/v1/me/escrows", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  return { escrows: await listPayerEscrows(claims.user_id) };
});

app.get("/v1/notifications", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const query = request.query as Record<string, string | undefined>;
  const organizationId = query.organizationId;
  const notifications = await getNotifications(claims.user_id, organizationId);
  return { notifications };
});

app.post("/v1/notifications/read", async (request) => {
  const claims = await verifyPrivyAccessToken(request.headers.authorization);
  const body = (request.body ?? {}) as Record<string, string | undefined>;
  const organizationId = body.organizationId;
  await markNotificationsRead(claims.user_id, organizationId);
  return { success: true };
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof InvoiceError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: "Invalid request.", issues: error.issues });
  }
  if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
    return reply.code(503).send({ error: "Database is not configured." });
  }

  request.log.error(error);
  return reply.code(500).send({ error: "Internal server error." });
});

const close = async () => {
  await app.close();
  if (sql) await sql.end();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: config.PORT, host: config.HOST });
