import type { OnboardingInput } from "../schemas.js";
import { sql } from "../database.js";
import { arcProtocol } from "../config.js";

const ARC_TESTNET_CAIP2 = arcProtocol.chainCaip2;

export async function ensureUser(privyUserId: string) {
  if (!sql) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }

  const [user] = await sql`
    insert into users (privy_user_id)
    values (${privyUserId})
    on conflict (privy_user_id)
    do update set updated_at = now()
    returning id, privy_user_id
  `;

  if (!user) throw new Error("USER_UPSERT_FAILED");
  return user;
}

export async function getOnboardingStatus(privyUserId: string) {
  if (!sql) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }

  const [profile] = await sql`
    select account_profiles.account_type
    from users
    join account_profiles on account_profiles.user_id = users.id
    where users.privy_user_id = ${privyUserId}
    limit 1
  `;

  const organizations = profile
    ? await sql`
        select
          organizations.id,
          organizations.name,
          organizations.organization_type,
          organizations.verification_status,
          organizations.country,
          organizations.address,
          organizations.website,
          organizations.contact_email,
          organizations.phone,
          (select wra.wallet_address from wallet_role_assignments wra where wra.organization_id = organizations.id and wra.role = 'transaction' order by wra.created_at desc limit 1) as primary_wallet_address,
          memberships.role
        from users
        join memberships on memberships.user_id = users.id
        join organizations on organizations.id = memberships.organization_id
        where users.privy_user_id = ${privyUserId}
        order by memberships.created_at asc
      `
    : [];

  return {
    onboarded: Boolean(profile),
    accountType: (profile?.account_type as "individual" | "organization" | undefined) ?? null,
    organizations,
  };
}

export async function saveOnboarding(privyUserId: string, input: OnboardingInput) {
  if (!sql) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }

  return sql.begin(async (transaction) => {
    const [user] = await transaction`
      insert into users (privy_user_id)
      values (${privyUserId})
      on conflict (privy_user_id)
      do update set updated_at = now()
      returning id, privy_user_id
    `;

    if (!user) throw new Error("USER_UPSERT_FAILED");

    await transaction`
      insert into account_profiles (user_id, account_type, display_name, email)
      values (${user.id}, ${input.accountType}, ${input.identityName || null}, ${input.email || null})
      on conflict (user_id)
      do update set account_type = excluded.account_type, display_name = coalesce(excluded.display_name, account_profiles.display_name), email = coalesce(excluded.email, account_profiles.email), updated_at = now()
    `;

    for (const wallet of input.wallets) {
      await transaction`
        insert into wallets (user_id, privy_wallet_id, address, wallet_type, chain_caip2)
        values (${user.id}, ${wallet.privyWalletId ?? null}, ${wallet.address.toLowerCase()}, ${wallet.walletType}, ${wallet.chain})
        on conflict (chain_caip2, address)
        do update set privy_wallet_id = coalesce(excluded.privy_wallet_id, wallets.privy_wallet_id), updated_at = now()
      `;
    }

    let organizationId: string | null = null;
    if (input.accountType === "organization" && input.organization) {
      const [existingOrganization] = await transaction`
        select organizations.id
        from organizations
        join memberships on memberships.organization_id = organizations.id
        where memberships.user_id = ${user.id}
          and memberships.role = 'administrator'
        order by memberships.created_at asc
        limit 1
      `;

      const [organization] = existingOrganization
        ? await transaction`
            update organizations
            set name = ${input.organization.name}, organization_type = ${input.organization.type}, country = ${input.organization.country || null}, address = ${input.organization.address || null}, website = ${input.organization.website || null}, contact_email = ${input.organization.contactEmail || null}, phone = ${input.organization.phone || null}, updated_at = now()
            where id = ${existingOrganization.id}
            returning id
          `
        : await transaction`
            insert into organizations (name, organization_type, verification_status, country, address, website, contact_email, phone)
            values (${input.organization.name}, ${input.organization.type}, 'pending', ${input.organization.country || null}, ${input.organization.address || null}, ${input.organization.website || null}, ${input.organization.contactEmail || null}, ${input.organization.phone || null})
            returning id
          `;
      if (!organization) throw new Error("ORGANIZATION_CREATE_FAILED");
      organizationId = organization.id as string;

      if (!existingOrganization) {
        await transaction`
          insert into memberships (organization_id, user_id, role)
          values (${organizationId}, ${user.id}, 'administrator')
        `;
      }

      await transaction`
        delete from wallet_role_assignments
        where organization_id = ${organizationId}
          and role in ('transaction', 'settlement')
      `;

      await transaction`
        insert into wallet_role_assignments (organization_id, wallet_address, chain_caip2, role, assigned_by_user_id)
        values (${organizationId}, ${input.transactionWalletAddress.toLowerCase()}, ${ARC_TESTNET_CAIP2}, 'settlement', ${user.id})
      `;
    }

    if (!organizationId) {
      await transaction`
        delete from wallet_role_assignments
        where organization_id is null
          and assigned_by_user_id = ${user.id}
          and role = 'transaction'
      `;
    }

    await transaction`
      insert into wallet_role_assignments (organization_id, wallet_address, chain_caip2, role, assigned_by_user_id)
      values (${organizationId}, ${input.transactionWalletAddress.toLowerCase()}, ${ARC_TESTNET_CAIP2}, 'transaction', ${user.id})
    `;

    return { userId: user.id as string, organizationId };
  });
}
