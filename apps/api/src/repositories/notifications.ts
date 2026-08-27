import { sql } from "../database.js";

export async function getNotifications(privyUserId: string, organizationId?: string) {
  if (!sql) return [];
  const [user] = await sql`select id from users where privy_user_id = ${privyUserId} limit 1`;
  if (!user) return [];
  
  if (organizationId) {
    // Verify user is a member of the organization before returning its notifications
    const [member] = await sql`select 1 from memberships where user_id = ${user.id} and organization_id = ${organizationId} limit 1`;
    if (!member) return [];
    return await sql`select id, title, message, link_url, is_read, created_at from notifications where organization_id = ${organizationId} order by created_at desc limit 50`;
  } else {
    return await sql`select id, title, message, link_url, is_read, created_at from notifications where user_id = ${user.id} order by created_at desc limit 50`;
  }
}

export async function markNotificationsRead(privyUserId: string, organizationId?: string) {
  if (!sql) return;
  const [user] = await sql`select id from users where privy_user_id = ${privyUserId} limit 1`;
  if (!user) return;
  
  if (organizationId) {
    // Verify user is a member of the organization
    const [member] = await sql`select 1 from memberships where user_id = ${user.id} and organization_id = ${organizationId} limit 1`;
    if (!member) return;
    await sql`update notifications set is_read = true where organization_id = ${organizationId} and is_read = false`;
  } else {
    await sql`update notifications set is_read = true where user_id = ${user.id} and is_read = false`;
  }
}
