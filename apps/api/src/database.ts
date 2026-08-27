import postgres from "postgres";
import { config } from "./config.js";

export const sql = config.DATABASE_URL
  ? postgres(config.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: { undefined: null },
    })
  : null;

export async function checkDatabase() {
  if (!sql) return false;
  try {
    await sql`select 1 as ready`;
    return true;
  } catch {
    return false;
  }
}
