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
    const failure = (await read(await request('', write('POST', body)), 422)).error;
    assert.equal(failure.code, 'VALIDATION_ERROR');
    assert.equal(typeof failure.message, 'string');
    assert.ok(Array.isArray(failure.formErrors));
    assert.equal(typeof failure.fieldErrors, 'object');
  }
  await read(await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }), 400);
  assert.deepEqual(await read(await request()), { tasks: [] }, 'Invalid creates must not write');

  const invalid = await read(await request('', write('POST', { title: ' ', status: 'bad' })), 422);
  assert.ok(invalid.error.fieldErrors.title.length);
  assert.ok(invalid.error.fieldErrors.status.length);
  assert.equal((await read(await request('', { method: 'POST', body: '{}' }), 415)).error.code, 'UNSUPPORTED_MEDIA_TYPE');
  for (const options of [{}, write('PATCH', { title: 'Test' }), { method: 'DELETE' }]) {
    const failure = await read(await request('/not-a-uuid', options), 400);
    assert.equal(failure.error.code, 'INVALID_ID');
    assert.ok(failure.error.fieldErrors.id.length);
  }
  const boundary = await read(await request('', write('POST', { title: 'x'.repeat(200) })), 201);
  assert.equal(boundary.title.length, 200);
  assert.equal((await request(`/${boundary.id}`, { method: 'DELETE' })).status, 204);

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
    await read(await request(path, write('PATCH', body)), 422);
    assert.deepEqual(await read(await request(path)), renamed, 'Rejected updates must not mutate records');
  }
  await read(await request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{broken' }), 400);
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
    assert.equal((await read(await request(path, options), 404)).error.code, 'NOT_FOUND');
  }
  assert.deepEqual((await read(await request())).tasks, [other]);
  assert.equal((await request(`/${other.id}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(await read(await request()), { tasks: [] });
  const unsupported = await request('', { method: 'PUT' });
  assert.equal(unsupported.headers.get('allow'), 'GET, HEAD, POST, OPTIONS');
  assert.equal((await read(unsupported, 405)).error.code, 'METHOD_NOT_ALLOWED');
  console.log('Passed: tasks CRUD lifecycle, shared storage, partial updates, validation, 404/405, and delete isolation.');
}
