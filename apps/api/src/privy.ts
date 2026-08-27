import { PrivyClient, verifyAccessToken, verifyIdentityToken } from "@privy-io/node";
import { createLocalJWKSet, createRemoteJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";
import { config } from "./config.js";

export const privy =
  config.PRIVY_APP_ID && config.PRIVY_APP_SECRET
    ? new PrivyClient({
        appId: config.PRIVY_APP_ID,
        appSecret: config.PRIVY_APP_SECRET,
        jwtVerificationKey: config.PRIVY_JWT_VERIFICATION_KEY,
      })
    : null;

function createVerificationKey(): JWTVerifyGetKey | string | null {
  if (config.PRIVY_JWKS_JSON) {
    try {
      return createLocalJWKSet(JSON.parse(config.PRIVY_JWKS_JSON) as JSONWebKeySet);
    } catch {
      throw new Error("PRIVY_JWKS_JSON must contain a valid Privy JWKS document.");
    }
  }

  if (config.PRIVY_JWT_VERIFICATION_KEY) {
    return config.PRIVY_JWT_VERIFICATION_KEY;
  }

  if (config.PRIVY_APP_ID) {
    return createRemoteJWKSet(new URL(`https://api.privy.io/v1/apps/${config.PRIVY_APP_ID}/jwks.json`));
  }

  return null;
}

const verificationKey = createVerificationKey();

export async function verifyPrivyAccessToken(authorization?: string) {
  if (!config.PRIVY_APP_ID || !verificationKey) {
    throw new AuthError(503, "Privy is not configured for this environment.");
  }

  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;

  if (!accessToken) {
    throw new AuthError(401, "A Privy bearer token is required.");
  }

  try {
    return await verifyAccessToken({
      access_token: accessToken,
      app_id: config.PRIVY_APP_ID,
      verification_key: verificationKey,
    });
  } catch {
    throw new AuthError(401, "The Privy access token is invalid or expired.");
  }
}

export async function assertPrivyWalletOwnership(privyUserId: string, identityToken: string | undefined, addresses: string[]) {
  if (!config.PRIVY_APP_ID || !verificationKey) {
    throw new AuthError(503, "Privy is not configured for this environment.");
  }

  let user;
  if (identityToken) {
    try {
      user = await verifyIdentityToken({
        identity_token: identityToken,
        app_id: config.PRIVY_APP_ID,
        verification_key: verificationKey,
      });
    } catch {
      throw new AuthError(401, "The Privy identity token is invalid or expired. Sign in again and retry.");
    }
  } else {
    if (!privy) {
      throw new AuthError(503, "Privy server verification is not configured.");
    }

    try {
      user = await privy.users()._get(privyUserId);
    } catch {
      throw new AuthError(503, "Privy could not verify wallet ownership. Please wait briefly and retry.");
    }
  }

  if (user.id !== privyUserId) {
    throw new AuthError(401, "The Privy identity token does not belong to this session.");
  }

  const linkedAddresses = new Set(
    user.linked_accounts
      .filter((account): account is typeof account & { address: string } => "address" in account)
      .map((account) => account.address.toLowerCase()),
  );
  const unverified = addresses.find((address) => !linkedAddresses.has(address.toLowerCase()));

  if (unverified) {
    throw new AuthError(400, `Wallet ${unverified} is not verified on the authenticated Privy account.`);
  }
}

export class AuthError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}
