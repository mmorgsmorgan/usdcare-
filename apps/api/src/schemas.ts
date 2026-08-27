import { z } from "zod";

const walletSchema = z.object({
  privyWalletId: z.string().min(1).optional(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  walletType: z.enum(["embedded", "external", "smart", "organization"]),
  chain: z.literal("eip155:5042002"),
});

export const onboardingSchema = z
  .object({
    accountType: z.enum(["individual", "organization"]),
    identityName: z.string().trim().min(2).max(160).optional(),
    email: z.string().email().max(240).optional(),
    organization: z
      .object({
        name: z.string().min(2).max(160),
        type: z.enum([
          "hospital",
          "clinic",
          "diagnostic_centre",
          "pharmacy",
          "ngo",
          "employer",
          "insurer",
          "other",
        ]),
        country: z.string().trim().max(100).optional(),
        address: z.string().trim().max(240).optional(),
        website: z.string().url().max(240).optional().or(z.literal("")),
        contactEmail: z.string().email().max(240).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
    wallets: z.array(walletSchema).min(1),
    transactionWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    sharedWalletRiskAcknowledged: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    const walletAddresses = new Set(value.wallets.map((wallet) => wallet.address.toLowerCase()));
    if (!walletAddresses.has(value.transactionWalletAddress.toLowerCase())) {
      context.addIssue({ code: "custom", path: ["transactionWalletAddress"], message: "Transaction wallet must be included in verified wallets." });
    }
    if (value.accountType === "organization" && !value.organization) {
      context.addIssue({ code: "custom", path: ["organization"], message: "Organization details are required." });
    }
  });

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

export const paymentRequestParamsSchema = z.object({
  publicId: z.string().uuid(),
});

export const createInvoiceSchema = z.object({
  patientReference: z.string().trim().min(2).max(100),
  serviceDescription: z.string().trim().min(2).max(240),
  amountUsdc: z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,6})?$/, "Use a positive USDC amount with up to six decimals.")
    .refine((amount) => Number(amount) > 0, "Amount must be greater than zero."),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

export const createEscrowSchema = z.object({
  patientReference: z.string().trim().min(2).max(100),
  treatmentName: z.string().trim().min(2).max(240),
  providerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  payerWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  payerWallets: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).max(32).optional(),
  openFunding: z.boolean().optional(),
  requiredPayerApprovals: z.number().int().min(0).max(32).optional(),
  chainEscrowId: z.string().regex(/^\d+$/).optional(),
  createTransactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  patientApproverWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  approvalPolicy: z.enum(["provider_only", "provider_and_patient"]),
  milestones: z.array(z.object({ label: z.string().trim().min(1).max(120), amountUsdc: z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/) }).refine((x) => Number(x.amountUsdc) > 0)).min(1).max(64),
});

export const escrowParamsSchema = z.object({ escrowId: z.string().uuid() });
export const escrowPublicParamsSchema = z.object({ publicId: z.string().uuid() });
export const escrowActionSchema = z.object({ action: z.enum(["create", "fund", "evidence", "approve", "release"]), chainEscrowId: z.string().regex(/^\d+$/).optional(), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), milestoneIndex: z.number().int().min(0).optional(), evidenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(), evidenceUrl: z.string().trim().min(1).max(2_000).optional(), evidenceDescription: z.string().trim().min(1).max(2_000).optional() });

export const disputeSchema = z.object({ reason: z.string().trim().min(10).max(2_000) });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
