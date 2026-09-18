import pg from 'pg';

const key = Symbol.for('nextjs-playground.postgres');
export class DatabaseUnavailableError extends Error {}

function pool() {
  if (!process.env.DATABASE_URL) throw new DatabaseUnavailableError('Database is not configured.');
  if (!globalThis[key]) {
    const instance = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      allowExitOnIdle: true,
    });
    instance.on('error', () => console.error('An idle database connection failed.'));
    globalThis[key] = instance;
  }
  return globalThis[key];
}

export async function query(text, values = []) {
  try { return await pool().query(text, values); }
  catch { throw new DatabaseUnavailableError('Database request failed.'); }
}

export async function transaction(action) {
  let client;
  try {
    client = await pool().connect();
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw new DatabaseUnavailableError('Database request failed.');
  } finally { client?.release(); }
}
