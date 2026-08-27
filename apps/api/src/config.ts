import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  PRIVY_JWT_VERIFICATION_KEY: z.string().min(1).optional(),
  PRIVY_JWKS_JSON: z.string().min(1).optional(),
});

export const config = envSchema.parse(process.env);

export const arcProtocol = {
  chainId: 5_042_002,
  chainCaip2: "eip155:5042002",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  providerRegistry: "0xfc050ccc0fb08fff6f8aa676668ad9ff97ca6d70",
  paymentRouter: "0x9bb94b96e3bfaf9a1cdd761843c412a36cc665d9",
  treatmentEscrow: "0xe12a385b431240bcb5dca741c44fb861b9e1431f",
} as const;

export const readiness = {
  database: Boolean(config.DATABASE_URL),
  privy: Boolean(config.PRIVY_APP_ID && config.PRIVY_APP_SECRET),
};
