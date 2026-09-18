import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function checkTasks(origin) {
  const request = (path = '', options = {}) => fetch(`${origin}/api/tasks${path}`, {
    ...options, signal: AbortSignal.timeout(3000),
  });
  const write = (method, body) => ({
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const read = async (response, status = 200) => {
    assert.equal(response.status, status);
    assert.match(response.headers.get('cache-control'), /no-store/);
    return response.json();
  };
  assert.deepEqual(await read(await request()), { tasks: [] });

  for (const body of [null, [], {}, { title: ' ' }, { title: 1 },
    { title: 'x'.repeat(201) }, { title: 'Test', status: 'invalid' }, { title: 'Test', id: 'client-id' }]) {
    assert.equal(typeof (await read(await request('', write('POST', body)), 400)).error, 'string');
  }
  await read(await request('', { method: 'POST', body: '{broken' }), 400);
  assert.deepEqual(await read(await request()), { tasks: [] }, 'Invalid creates must not write');

  const response = await request('', write('POST', { title: '  Learn CRUD  ' }));
  const task = await read(response, 201);
  assert.match(task.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(task.title, 'Learn CRUD');
  assert.equal(task.status, 'todo');
  assert.ok(Number.isFinite(Date.parse(task.createdAt)));
  assert.equal(task.createdAt, task.updatedAt);
  assert.equal(response.headers.get('location'), `/api/tasks/${task.id}`);
  const path = `/${task.id}`;
  assert.deepEqual(await read(await request(path)), task, 'Collection and detail routes must share storage');
  assert.deepEqual((await read(await request())).tasks, [task]);

  await delay(25);
  const updated = await read(await request(path, write('PATCH', { status: 'in_progress' })));
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.title, task.title);
  assert.equal(updated.createdAt, task.createdAt);
  assert.equal(updated.id, task.id);
  assert.ok(Date.parse(updated.updatedAt) > Date.parse(task.updatedAt));
  const renamed = await read(await request(path, write('PATCH', { title: 'New title' })));
  assert.equal(renamed.title, 'New title');
  assert.equal(renamed.status, 'in_progress', 'Partial update preserves omitted fields');
  for (const body of [{}, { title: '' }, { status: null }, { title: 'Must not apply', status: 'invalid' },
    { id: 'overwrite' }, { createdAt: 'overwrite' }, { updatedAt: 'overwrite' }]) {
    await read(await request(path, write('PATCH', body)), 400);
    assert.deepEqual(await read(await request(path)), renamed, 'Rejected updates must not mutate records');
  }
  await read(await request(path, { method: 'PATCH', body: '{broken' }), 400);
  const completed = await read(await request(path, write('PATCH', { title: 'Finished', status: 'done' })));
  assert.equal(completed.status, 'done');
  assert.equal(completed.title, 'Finished');

  const other = await read(await request('', write('POST', { title: 'Keep me', status: 'done' })), 201);
  assert.notEqual(other.id, task.id);
  const removed = await request(path, { method: 'DELETE' });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
  assert.match(removed.headers.get('cache-control'), /no-store/);
  for (const options of [{}, write('PATCH', { title: 'Missing' }), { method: 'DELETE' }]) {
    await read(await request(path, options), 404);
  }
  assert.deepEqual((await read(await request())).tasks, [other]);
  assert.equal((await request(`/${other.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(await read(await request()), { tasks: [] });
  assert.equal((await request('', { method: 'PUT' })).status, 405);
  console.log('Passed: tasks CRUD lifecycle, shared storage, partial updates, validation, 404/405, and delete isolation.');
}
