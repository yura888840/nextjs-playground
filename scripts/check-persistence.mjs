import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database.mjs';

process.env.DATABASE_URL = testDatabaseUrl();
const { deleteTask } = await import('../lib/task-store.js');
const { query } = await import('../lib/db.js');
const ownerId = randomUUID();
await query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [ownerId, `persistence-${ownerId}@example.test`, 'unused test fixture']);
function run(code) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: process.env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
let id;
try {
  const created = run(`import {createTask} from './lib/task-store.js';
    console.log(JSON.stringify(await createTask({title:"Persistence test"},${JSON.stringify(ownerId)})));`);
  id = created.id;
  const persisted = run(`import {getTask,updateTask} from './lib/task-store.js';
    const id = ${JSON.stringify(id)};
    const ownerId = ${JSON.stringify(ownerId)};
    const original = await getTask(id,ownerId);
    await Promise.all([updateTask(id,{title:"Updated title"},ownerId),updateTask(id,{status:"done"},ownerId)]);
    console.log(JSON.stringify({original,updated:await getTask(id,ownerId)}));`);
  assert.deepEqual(persisted.original, created, 'A new process must see the persisted task');
  assert.equal(persisted.updated.title, 'Updated title');
  assert.equal(persisted.updated.status, 'done', 'Concurrent changes to different fields must both survive');
  console.log('Passed: persistence across processes and atomic partial updates.');
} finally {
  if (id) await deleteTask(id, ownerId);
  await query('DELETE FROM users WHERE id=$1', [ownerId]);
}
