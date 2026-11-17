import postgres from 'postgres';
import { config } from './config.mjs';
export const sql = postgres(config.DATABASE_URL, { max: 16, idle_timeout: 30, connect_timeout: 10 });
export async function audit(tx, actor, action, target, details = {}) {
  await tx`insert into audit_events (actor_id, action, target_id, details) values (${actor}, ${action}, ${String(target)}, ${tx.json(details)})`;
}
