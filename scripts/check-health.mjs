import assert from 'node:assert/strict';
import { testDatabaseUrl } from './test-database.mjs';

if (process.argv.includes('--tasks')) process.env.DATABASE_URL = testDatabaseUrl();
if (process.argv.includes('--storage-unavailable')) process.env.DATABASE_URL = '';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Start the production build on an OS-assigned port and test actual HTTP behavior.
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '0'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
let logs = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { logs += chunk; });
let spawnError;
server.on('error', error => { spawnError = error; });
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
try {
  let origin;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    const match = logs.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) {
      origin = match[0];
      try { if ((await request(origin)).ok) break; } catch {}
    }
    await delay(100);
  }
  assert.ok(origin, `Server did not start: ${logs}`);
  assert.equal((await request(origin)).status, 200);
  const before = Date.now();
  const first = await request(`${origin}/api/health`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type'), /application\/json/);
  assert.match(first.headers.get('cache-control'), /no-store/);
  const body = await first.json();
  assert.equal(body.status, 'ok');
  const timestamp = Date.parse(body.timestamp);
  assert.ok(timestamp >= before && timestamp <= Date.now(), 'Timestamp must be generated for the request');
  await delay(25);
  const second = await (await request(`${origin}/api/health`)).json();
  assert.ok(Date.parse(second.timestamp) > timestamp, 'Responses must not be cached');
  assert.equal((await request(`${origin}/api/health`, { method: 'POST' })).status, 405);
  console.log('Passed: homepage, health JSON, fresh timestamps, no-store, POST rejection.');
  if (process.argv.includes('--storage-unavailable')) {
    const response = await request(`${origin}/api/tasks`);
    assert.equal(response.status, 503);
    const failure = await response.json();
    assert.equal(failure.error.code, 'DATABASE_UNAVAILABLE');
    assert.deepEqual(failure.error.fieldErrors, {});
    assert.deepEqual(failure.error.formErrors, []);
    console.log('Passed: unconfigured storage returns a structured 503.');
  }
  if (process.argv.includes('--tasks')) {
    const { checkTasks } = await import('./check-tasks.mjs');
    await checkTasks(origin);
  }
} finally {
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timeout);
  }
}
