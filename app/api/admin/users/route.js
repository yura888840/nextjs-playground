import { authenticated } from '../../../../lib/permissions.js';
import { query } from '../../../../lib/db.js';
import { json } from '../../../../lib/task-http.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Role demonstration: list at most 100 public account records, never credentials.
export const GET = authenticated(async () => {
  const { rows } = await query('SELECT id,email,role FROM users ORDER BY created_at,id LIMIT 100');
  return json({ users: rows });
}, 'admin');
