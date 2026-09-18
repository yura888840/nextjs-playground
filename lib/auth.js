import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { query, transaction } from './db.js';
import { hashPassword, verifyPassword, dummyHash } from './password.js';
import { error } from './task-http.js';

export const sessionCookie = process.env.NODE_ENV === 'production' ? '__Host-session' : 'session';
const duration = 7 * 24 * 60 * 60;
const digest = value => createHash('sha256').update(value).digest('hex');
export const publicUser = row => ({ id: row.id, email: row.email });

export function readSessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}
export function cookieHeader(token, clear = false) {
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : duration}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function checkOrigin(request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    return error('A same-origin request is required.', 403, 'INVALID_ORIGIN');
  }
  return null;
}
export async function currentUser(token) {
  if (!token) return null;
  const { rows } = await query(`SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > now()`, [digest(token)]);
  return rows[0] ? publicUser(rows[0]) : null;
}
export async function revokeSession(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
}
export async function allowAttempt(email) {
  const { rows } = await query(`INSERT INTO auth_attempts (key, attempts, reset_at)
    VALUES ($1, 1, now() + interval '15 minutes') ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN auth_attempts.reset_at <= now() THEN 1 ELSE auth_attempts.attempts + 1 END,
    reset_at = CASE WHEN auth_attempts.reset_at <= now() THEN now() + interval '15 minutes' ELSE auth_attempts.reset_at END
    RETURNING attempts`, [digest(email)]);
  return rows[0].attempts <= 10;
}
export async function authenticate({ email, password }, register, previousToken) {
  let row;
  let passwordHash;
  if (register) passwordHash = await hashPassword(password);
  else {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    row = result.rows[0];
    const valid = await verifyPassword(password, row?.password_hash || dummyHash);
    if (!row || !valid) return null;
  }
  const token = randomBytes(32).toString('hex');
  return transaction(async client => {
    if (register) {
      const result = await client.query(`INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)
        ON CONFLICT (email) DO NOTHING RETURNING *`, [randomUUID(), email, passwordHash]);
      row = result.rows[0];
      if (!row) return null;
    }
    if (previousToken) await client.query('DELETE FROM sessions WHERE token_hash = $1', [digest(previousToken)]);
    await client.query(`INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now() + interval '7 days')`, [digest(token), row.id]);
    return { user: publicUser(row), token };
  });
}
