import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const [email, role] = process.argv.slice(2);
if (!email || !['user', 'admin'].includes(role)) throw new Error('Usage: npm run user:role -- email user|admin');
const { query } = await import('../lib/db.js');
const result = await query('UPDATE users SET role=$2 WHERE email=$1 RETURNING id', [email.trim().toLowerCase(), role]);
if (!result.rowCount) { console.error('Account not found.'); process.exitCode = 1; }
else console.log('Account role updated. Existing sessions use the new role immediately.');
