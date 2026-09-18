import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { query } from '../lib/db.js';
export async function createTestAccount(origin) {
  const email = `permissions-${randomUUID()}@example.test`;
  const response = await fetch(`${origin}/api/auth/register`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'A long test password 123!' }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const { user } = await response.json();
  return { user, cookie: response.headers.get('set-cookie').split(';')[0], cleanup: async () => {
    await query('DELETE FROM users WHERE id=$1', [user.id]);
    await query('DELETE FROM auth_attempts WHERE key=$1', [createHash('sha256').update(email).digest('hex')]);
  } };
}
