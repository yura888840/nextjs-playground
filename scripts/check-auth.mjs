import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { query } from '../lib/db.js';

export async function checkAuth(origin) {
  const email = `auth-${randomUUID()}@example.test`;
  const unknown = `missing-${randomUUID()}@example.test`;
  const password = 'A long test password 123!';
  const request = (path, options = {}) => fetch(`${origin}/api/auth/${path}`, { ...options, signal: AbortSignal.timeout(15000) });
  const write = (body, cookie = '', source = origin) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source, Cookie: cookie }, body: JSON.stringify(body) });
  const hash = value => createHash('sha256').update(value).digest('hex');
  try {
    assert.equal((await request('me')).status, 401);
    assert.equal((await request('register', write({ email, password }, '', 'https://other.example'))).status, 403);
    assert.equal((await request('register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).status, 403);
    assert.equal((await request('register', write({ email, password, role: 'admin' }))).status, 422);
    assert.equal((await request('register', write({ email, password: 'short' }))).status, 422);
    assert.equal((await request('register', write({ email, password: 'x'.repeat(5000) }))).status, 413);
    const created = await request('register', write({ email: ` ${email.toUpperCase()} `, password }));
    assert.equal(created.status, 201);
    const header = created.headers.get('set-cookie');
    for (const value of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/', 'Max-Age=604800']) assert.ok(header.includes(value));
    let cookie = header.split(';')[0];
    const user = (await created.json()).user;
    assert.equal(user.email, email);
    assert.equal(user.password_hash, undefined);
    const stored = (await query('SELECT * FROM users WHERE id=$1', [user.id])).rows[0];
    assert.match(stored.password_hash, /^scrypt\$/);
    assert.ok(!stored.password_hash.includes(password));
    const token = cookie.split('=')[1];
    assert.equal((await query('SELECT token_hash FROM sessions WHERE user_id=$1', [user.id])).rows[0].token_hash, hash(token));
    assert.equal((await request('me', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await request('register', write({ email, password }))).status, 409);
    const bad = await request('login', write({ email, password: 'The wrong password 123!' }));
    const missing = await request('login', write({ email: unknown, password }));
    assert.equal(bad.status, 401); assert.equal(missing.status, 401);
    assert.deepEqual(await bad.json(), await missing.json());
    const login = await request('login', write({ email, password }, cookie));
    assert.equal(login.status, 200);
    const previousCookie = cookie;
    cookie = login.headers.get('set-cookie').split(';')[0];
    assert.notEqual(cookie, previousCookie);
    assert.equal((await request('me', { headers: { Cookie: previousCookie } })).status, 401);
    assert.equal((await request('logout', write({}, cookie, 'https://other.example'))).status, 403);
    assert.equal((await request('me', { headers: { Cookie: cookie } })).status, 200);
    const logout = await request('logout', write({}, cookie));
    assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await request('me', { headers: { Cookie: cookie } })).status, 401);
    const again = await request('login', write({ email, password }));
    const expired = again.headers.get('set-cookie').split(';')[0];
    await query('UPDATE sessions SET expires_at=now() - interval \'1 second\' WHERE user_id=$1', [user.id]);
    assert.equal((await request('me', { headers: { Cookie: expired } })).status, 401);
    // Exhaust the shared account limit without paying for repeated password hashes.
    await query('UPDATE auth_attempts SET attempts=10 WHERE key=$1', [hash(email)]);
    const limited = await request('login', write({ email, password }));
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '900');
    console.log('Passed: registration, hashing, cookie flags, login, rotation, revocation, expiry, origin protection, validation and throttling.');
  } finally {
    await query('DELETE FROM users WHERE email=$1', [email]);
    await query('DELETE FROM auth_attempts WHERE key = ANY($1::text[])', [[hash(email), hash(unknown)]]);
  }
}
