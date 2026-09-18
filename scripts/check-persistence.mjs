import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database.mjs';

process.env.DATABASE_URL = testDatabaseUrl();
const { deleteTask } = await import('../lib/task-store.js');
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
    console.log(JSON.stringify(await createTask({title:"Persistence test"})));`);
  id = created.id;
  const persisted = run(`import {getTask,updateTask} from './lib/task-store.js';
    const id = ${JSON.stringify(id)};
    const original = await getTask(id);
    await Promise.all([updateTask(id,{title:"Updated title"}),updateTask(id,{status:"done"})]);
    console.log(JSON.stringify({original,updated:await getTask(id)}));`);
  assert.deepEqual(persisted.original, created, 'A new process must see the persisted task');
  assert.equal(persisted.updated.title, 'Updated title');
  assert.equal(persisted.updated.status, 'done', 'Concurrent changes to different fields must both survive');
  console.log('Passed: persistence across processes and atomic partial updates.');
} finally {
  if (id) await deleteTask(id);
}
