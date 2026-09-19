import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db.js';
import { createTestAccount } from './test-account.mjs';

export async function checkSearch(origin) {
  const accounts = [];
  try {
    const a = await createTestAccount(origin); accounts.push(a);
    const b = await createTestAccount(origin); accounts.push(b);
    const titles = ['Alpha report', 'alpha review', 'Beta', '100% complete', 'under_score', 'back\\slash', "SQL ' OR 1=1 --"];
    const ids = [];
    for (let i = 0; i < titles.length; i++) {
      const id = randomUUID(); ids.push(id);
      await query('INSERT INTO tasks(id,owner_id,title,status,created_at) VALUES($1,$2,$3,$4,$5)', [id,a.user.id,titles[i],i % 2 ? 'done' : 'todo','2026-01-01T00:00:00Z']);
    }
    await query('INSERT INTO tasks(id,owner_id,title) VALUES($1,$2,$3)',[randomUUID(),b.user.id,'Alpha private']);
    const request = (suffix='', cookie=a.cookie) => fetch(`${origin}/api/tasks${suffix}`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(5000)});
    const list = async suffix => { const r=await request(suffix); assert.equal(r.status,200); assert.match(r.headers.get('cache-control'),/no-store/); return r.json(); };
    assert.equal((await request('?page=1','')).status,401);
    const first=await list('?pageSize=3');
    assert.deepEqual(first.pagination,{page:1,pageSize:3,total:7,totalPages:3,hasNext:true,hasPrevious:false});
    const second=await list('?pageSize=3&page=2'); const third=await list('?pageSize=3&page=3');
    assert.deepEqual([...first.tasks,...second.tasks,...third.tasks].map(x=>x.id),[...ids].sort(),'Equal timestamps must use UUID as a deterministic tie-breaker');
    assert.equal(third.pagination.hasNext,false);
    const beyond=await list('?page=4&pageSize=3'); assert.deepEqual(beyond.tasks,[]); assert.equal(beyond.pagination.total,7);
    const search=await list('?q=ALPHA&status=done'); assert.equal(search.tasks.length,1); assert.equal(search.tasks[0].title,'alpha review'); assert.equal(search.pagination.total,1);
    for(const value of ['%', '_', '\\', "' OR 1=1 --"]) assert.equal((await list(`?q=${encodeURIComponent(value)}`)).pagination.total,1,'Search characters must be literal');
    const empty=await list('?q=nothing-matches'); assert.equal(empty.pagination.total,0); assert.equal(empty.pagination.totalPages,0); assert.deepEqual(empty.tasks,[]);
    assert.deepEqual((await list('?sort=newest')).tasks.map(x=>x.id),[...ids].sort().reverse());
    assert.equal((await list('?sort=title&pageSize=1')).tasks[0].title,'100% complete');
    for(const suffix of ['?page=0','?page=-1','?page=1.5','?page=1e2','?page=10001','?pageSize=101','?pageSize=','?status=bad','?sort=id;DROP','?owner_id=1','?page=1&page=2',`?q=${'x'.repeat(201)}`]) {
      const r=await request(suffix); assert.equal(r.status,400,suffix); assert.equal((await r.json()).error.code,'INVALID_QUERY');
    }
    // Filtering and pagination must still return only the current owner's totals.
    const other=await (await request('?q=alpha',b.cookie)).json(); assert.equal(other.pagination.total,1); assert.equal(other.tasks[0].title,'Alpha private');
    console.log('Passed: search, literal wildcards, status filters, pagination metadata, stable sorting, query validation and owner isolation.');
  } finally { for(const account of accounts) await account.cleanup(); }
}
