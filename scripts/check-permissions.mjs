import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestAccount } from './test-account.mjs';
import { query } from '../lib/db.js';

export async function checkPermissions(origin) {
  const accounts = [];
  const legacyId = randomUUID();
  const request = (path, cookie = '', method = 'GET', body, source = origin) => fetch(`${origin}${path}`, {
    method, headers: { Cookie: cookie, Origin: source, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
  try {
    const a = await createTestAccount(origin); accounts.push(a);
    const b = await createTestAccount(origin); accounts.push(b);
    assert.equal(a.user.role, 'user');
    for (const [method, path, body] of [
      ['GET','/api/tasks'], ['POST','/api/tasks',{ title: 'Blocked' }],
      ['GET',`/api/tasks/${legacyId}`], ['PATCH',`/api/tasks/${legacyId}`,{status:'done'}], ['DELETE',`/api/tasks/${legacyId}`],
    ]) assert.equal((await request(path,'',method,body)).status,401);
    const page = await fetch(`${origin}/tasks`, { redirect: 'manual' });
    assert.equal(page.status,307); assert.equal(page.headers.get('location'),'/account');
    assert.equal((await fetch(`${origin}/tasks`, { headers:{Cookie:a.cookie}, redirect:'manual' })).status,200);
    const made = await request('/api/tasks',a.cookie,'POST',{title:'Private task'});
    assert.equal(made.status,201); const task=await made.json(); const path=`/api/tasks/${task.id}`;
    await query('INSERT INTO tasks(id,title) VALUES($1,$2)',[legacyId,'Legacy unowned task']);
    assert.deepEqual((await (await request('/api/tasks',b.cookie)).json()).tasks,[]);
    assert.equal((await (await request('/api/tasks',a.cookie)).json()).tasks.length,1);
    for (const [method,body] of [['GET'],['PATCH',{title:'Stolen'}],['DELETE']]) {
      const foreign=await request(path,b.cookie,method,body);
      const absent=await request(`/api/tasks/${randomUUID()}`,b.cookie,method,body);
      assert.equal(foreign.status,404); assert.equal(absent.status,404);
      assert.deepEqual(await foreign.json(),await absent.json());
    }
    assert.equal((await request(`/api/tasks/${legacyId}`,a.cookie)).status,404);
    for (const extra of [{ownerId:b.user.id},{owner_id:b.user.id},{role:'admin'}]) {
      assert.equal((await request('/api/tasks',a.cookie,'POST',{title:'Forged',...extra})).status,422);
      assert.equal((await request(path,a.cookie,'PATCH',extra)).status,422);
    }
    assert.equal((await request(path,a.cookie,'PATCH',{status:'done'},'https://evil.example')).status,403);
    assert.equal((await request(path,a.cookie,'DELETE',undefined,'https://evil.example')).status,403);
    assert.equal((await request('/api/admin/users')).status,401);
    assert.equal((await request('/api/admin/users',a.cookie)).status,403);
    await query("UPDATE users SET role='admin' WHERE id=$1",[a.user.id]);
    const admin=await request('/api/admin/users',a.cookie); assert.equal(admin.status,200);
    for (const item of (await admin.json()).users) assert.deepEqual(Object.keys(item).sort(),['email','id','role']);
    const bTask=await (await request('/api/tasks',b.cookie,'POST',{title:'Other owner'})).json();
    assert.equal((await request(`/api/tasks/${bTask.id}`,a.cookie)).status,404,'Admins do not bypass task ownership');
    await query("UPDATE users SET role='user' WHERE id=$1",[a.user.id]);
    assert.equal((await request('/api/admin/users',a.cookie)).status,403,'Role changes apply to existing sessions');
    assert.equal((await request(path,a.cookie,'PATCH',{status:'done'})).status,200);
    assert.equal((await request(path,a.cookie,'DELETE')).status,204);
    console.log('Passed: anonymous rejection, page guard, two-user isolation, owner spoofing, CSRF, legacy tasks, admin role and live demotion.');
  } finally {
    await query('DELETE FROM tasks WHERE id=$1',[legacyId]);
    for (const account of accounts) await account.cleanup();
  }
}
