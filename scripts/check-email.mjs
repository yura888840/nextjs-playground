import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createTestAccount } from './test-account.mjs';
import { query } from '../lib/db.js';
import { claimEmailJob, finishEmailJob } from '../lib/email-store.js';
import { runEmailJobs } from '../lib/email-worker.js';
import { deliverEmail, EmailDeliveryError } from '../lib/email-provider.js';

export async function checkEmail(origin){
  const accounts=[];
  const original={mode:process.env.EMAIL_MODE,key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM};
  try{
    const a=await createTestAccount(origin);accounts.push(a);const b=await createTestAccount(origin);accounts.push(b);
    await query('INSERT INTO tasks(id,owner_id,title) VALUES($1,$2,$3)',[randomUUID(),a.user.id,'My private summary task']);
    await query('INSERT INTO tasks(id,owner_id,title) VALUES($1,$2,$3)',[randomUUID(),b.user.id,'Never include this other owner']);
    const request=(path,options={},cookie=a.cookie)=>fetch(`${origin}/api/notifications/${path}`,{...options,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(5000)});
    const requestId=randomUUID();const write=body=>({method:'POST',body:JSON.stringify(body)});
    assert.equal((await request('task-summary',write({requestId}),'' )).status,401);
    assert.equal((await request('task-summary',{...write({requestId}),headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await request('task-summary',write({requestId,to:'other@example.test'}))).status,422);
    const responses=await Promise.all([request('task-summary',write({requestId})),request('task-summary',write({requestId}))]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,202]);
    const bodies=await Promise.all(responses.map(r=>r.json()));const id=bodies[0].job.id;
    assert.equal(bodies[1].job.id,id);
    assert.equal((await request('task-summary',write({requestId:randomUUID()}))).status,429);
    const detail=(await (await request(`jobs/${id}`)).json()).job;
    assert.equal(detail.mode,'preview');assert.equal(detail.preview.to,a.user.email);assert.match(detail.preview.text,/My private/);assert.ok(!detail.preview.text.includes('Never include'));
    assert.equal((await request(`jobs/${id}`,{},b.cookie)).status,404);
    assert.deepEqual((await (await request('jobs',{},b.cookie)).json()).jobs,[]);
    assert.equal((await fetch(`${origin}/api/internal/email-jobs`,{method:'POST'})).status,401);
    // Restart boundary: a standalone process reads the persisted job and previews it.
    const child=spawnSync(process.execPath,['scripts/email-worker.mjs'],{env:{...process.env,EMAIL_MODE:'preview'},encoding:'utf8',timeout:20000});
    assert.equal(child.status,0,child.stderr);
    assert.equal((await (await request(`jobs/${id}`)).json()).job.status,'previewed');
    const again=await request('task-summary',write({requestId}));assert.equal(again.status,200);assert.equal((await again.json()).job.status,'previewed');
    const makeJob=async(mode='send')=>{
      const id=randomUUID();await query('INSERT INTO email_jobs(id,owner_id,request_id,mode,payload) VALUES($1,$2,$3,$4,$5)',[id,a.user.id,randomUUID(),mode,{from:'sender@example.test',to:a.user.email,subject:'Test',text:'Test content'}]);return id;
    };
    const concurrent=await makeJob();let calls=0;
    const fake=async()=>{calls++;return {id:'provider-fake',preview:false};};
    await Promise.all([runEmailJobs({limit:1,deliver:fake}),runEmailJobs({limit:1,deliver:fake})]);
    assert.equal(calls,1);assert.equal((await query('SELECT status FROM email_jobs WHERE id=$1',[concurrent])).rows[0].status,'sent');
    const retry=await makeJob();
    await runEmailJobs({limit:1,deliver:async()=>{throw new EmailDeliveryError('PROVIDER_UNAVAILABLE');}});
    let row=(await query('SELECT * FROM email_jobs WHERE id=$1',[retry])).rows[0];
    assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.ok(row.available_at.getTime()>Date.now());
    await query('UPDATE email_jobs SET available_at=now(),attempts=4 WHERE id=$1',[retry]);
    await runEmailJobs({limit:1,deliver:async()=>{throw new EmailDeliveryError('PROVIDER_UNAVAILABLE');}});
    row=(await query('SELECT * FROM email_jobs WHERE id=$1',[retry])).rows[0];assert.equal(row.status,'failed');assert.equal(row.attempts,5);
    const permanent=await makeJob();await runEmailJobs({limit:1,deliver:async()=>{throw new EmailDeliveryError('PROVIDER_HTTP_422',false);}});
    assert.equal((await query('SELECT status FROM email_jobs WHERE id=$1',[permanent])).rows[0].status,'failed');
    const crashed=await makeJob();const oldClaim=await claimEmailJob();assert.equal(oldClaim.id,crashed);
    await query("UPDATE email_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[crashed]);
    const reclaimed=await claimEmailJob();assert.equal(reclaimed.id,crashed);assert.notEqual(reclaimed.lease_token,oldClaim.lease_token);
    assert.equal(await finishEmailJob(oldClaim,{id:'old-result'}),false);assert.equal(await finishEmailJob(reclaimed,{id:'new-result'}),true);
    const expired=await makeJob();await query("UPDATE email_jobs SET created_at=now()-interval '21 hours' WHERE id=$1",[expired]);
    assert.equal((await runEmailJobs({limit:1,deliver:fake})).processed,0);
    assert.equal((await query('SELECT status FROM email_jobs WHERE id=$1',[expired])).rows[0].status,'failed');
    const previewId=await makeJob('preview');
    const worker=await fetch(`${origin}/api/internal/email-jobs`,{method:'POST',headers:{Authorization:`Bearer ${process.env.EMAIL_WORKER_SECRET}`}});
    assert.equal(worker.status,200);assert.equal((await worker.json()).previewed,1);
    assert.equal((await query('SELECT status FROM email_jobs WHERE id=$1',[previewId])).rows[0].status,'previewed');
    // Test the provider adapter without making any real external calls.
    const sample={id:randomUUID(),mode:'send',payload:{from:'captured@example.test',to:a.user.email,subject:'Stable',text:'Stable body'}};
    process.env.EMAIL_MODE='send';process.env.RESEND_API_KEY='fake-test-key';process.env.EMAIL_FROM='changed@example.test';
    const seen=[];const transport=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'error');seen.push(options);return Response.json({id:'fake-provider-id'});};
    await deliverEmail(sample,transport);await deliverEmail(sample,transport);
    assert.equal(seen[0].headers['Idempotency-Key'],seen[1].headers['Idempotency-Key']);assert.equal(seen[0].body,seen[1].body);assert.equal(JSON.parse(seen[0].body).from,'captured@example.test');
    await assert.rejects(()=>deliverEmail(sample,async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})),e=>e.retryable&&e.retryAfter===120);
    await assert.rejects(()=>deliverEmail(sample,async()=>new Response('',{status:422})),e=>!e.retryable);
    await assert.rejects(()=>deliverEmail(sample,async()=>{throw new Error('timeout');}),e=>e.code==='PROVIDER_UNAVAILABLE');
    assert.deepEqual(await deliverEmail({...sample,mode:'preview'},()=>{throw new Error('Must never call provider');}),{preview:true});
    console.log('Passed: durable enqueue, request deduplication, owner-only previews, worker auth, process restart, concurrent claims, backoff, exhaustion, leases and fake-provider idempotency.');
  }finally{
    for(const account of accounts)await account.cleanup();
    for(const [key,value]of Object.entries({EMAIL_MODE:original.mode,RESEND_API_KEY:original.key,EMAIL_FROM:original.from})){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
}
