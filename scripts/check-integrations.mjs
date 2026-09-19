import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { query } from '../lib/db.js';
import { createTestAccount } from './test-account.mjs';
import { fetchGithubIssue } from '../lib/github-client.js';

export async function checkIntegrations(origin){
  process.env.NODE_ENV='production';
  const { githubImportHandler }=await import('../lib/github-import-handler.js');
  const accounts=[]; const deliveries=[];
  const repo=`test-${randomUUID()}`; const source={owner:'fixtures',repo,issueNumber:42};
  const issue={number:42,title:'Imported issue',state:'open',updated_at:'2026-01-01T00:00:00Z'};
  let providerCalls=0;
  const provider=async(url,options)=>{providerCalls++;assert.equal(new URL(url).hostname,'api.github.com');assert.equal(options.redirect,'error');assert.ok(options.signal);return Response.json(issue);};
  try{
    const a=await createTestAccount(origin);accounts.push(a);const b=await createTestAccount(origin);accounts.push(b);
    const bodyRequest=(value=source,cookie=a.cookie,sourceOrigin=origin)=>new Request(`${origin}/api/integrations/github/import`,{method:'POST',headers:{Cookie:cookie,Origin:sourceOrigin,'Content-Type':'application/json'},body:JSON.stringify(value)});
    const handler=githubImportHandler(provider);
    const created=await handler(bodyRequest()); assert.equal(created.status,201);const first=await created.json();
    const repeated=await handler(bodyRequest());assert.equal(repeated.status,200);assert.equal((await repeated.json()).taskId,first.taskId);
    const other=await (await handler(bodyRequest(source,b.cookie))).json();assert.notEqual(other.taskId,first.taskId);
    const count=providerCalls;
    assert.equal((await handler(bodyRequest({...source,owner:'../../evil'}))).status,422);
    assert.equal((await handler(bodyRequest({...source,url:'http://localhost'}))).status,422);
    assert.equal((await handler(bodyRequest(source,''))).status,401);
    assert.equal((await handler(bodyRequest(source,a.cookie,'https://evil.example'))).status,403);
    assert.equal(providerCalls,count);
    for(const [status,code]of [[404,'GITHUB_NOT_FOUND'],[429,'GITHUB_RATE_LIMITED'],[500,'GITHUB_UNAVAILABLE']]){
      await assert.rejects(()=>fetchGithubIssue(source,async()=>new Response('',{status})),err=>err.code===code);
    }
    await assert.rejects(()=>fetchGithubIssue(source,async()=>{throw new Error('timeout');}),err=>err.code==='GITHUB_UNAVAILABLE');
    await assert.rejects(()=>fetchGithubIssue(source,async()=>Response.json({})),err=>err.code==='GITHUB_INVALID_RESPONSE');
    await assert.rejects(()=>fetchGithubIssue(source,async()=>Response.json({...issue,pull_request:{}})),err=>err.code==='GITHUB_NOT_AN_ISSUE');
    await query('UPDATE github_import_limits SET attempts=20 WHERE user_id=$1',[a.user.id]);
    assert.equal((await handler(bodyRequest())).status,429);
    // Exercise the deployed HTTP webhook path, including exact raw-body signatures.
    const event={action:'closed',repository:{full_name:`fixtures/${repo}`},issue:{...issue,state:'closed',title:'Closed by GitHub',updated_at:'2026-02-01T00:00:00Z'}};
    const deliver=async(payload=event,{id=randomUUID(),signature,eventName='issues'}={})=>{
      deliveries.push(id);const bytes=JSON.stringify(payload);
      return fetch(`${origin}/api/webhooks/github`,{method:'POST',headers:{'Content-Type':'application/json','X-GitHub-Delivery':id,'X-GitHub-Event':eventName,'X-Hub-Signature-256':signature??`sha256=${createHmac('sha256',process.env.GITHUB_WEBHOOK_SECRET).update(bytes).digest('hex')}`},body:bytes});
    };
    assert.equal((await deliver(event,{signature:'sha256='+'0'.repeat(64)})).status,401);
    const delivery=randomUUID();const accepted=await deliver(event,{id:delivery});assert.equal(accepted.status,200);assert.equal((await accepted.json()).updated,2);
    assert.equal((await (await deliver(event,{id:delivery})).json()).duplicate,true);
    assert.equal((await deliver({...event,action:'edited'},{id:delivery})).status,409);
    const stale=await deliver({...event,issue:{...issue,updated_at:'2026-01-15T00:00:00Z'}});assert.equal((await stale.json()).updated,0);
    const task=(await query('SELECT title,status FROM tasks WHERE id=$1',[first.taskId])).rows[0];assert.deepEqual(task,{title:'Closed by GitHub',status:'done'});
    assert.equal((await deliver(event,{eventName:'ping'})).status,202);
    assert.equal((await deliver({action:'closed'})).status,422);
    await query('DELETE FROM tasks WHERE id=$1',[first.taskId]);
    const next=await deliver({...event,issue:{...event.issue,updated_at:'2026-03-01T00:00:00Z'}});assert.equal((await next.json()).updated,1,'Deleted tasks must not be recreated');
    console.log('Passed: provider validation/failures, authenticated import, deduplication, rate limits, signatures, replay, stale events and mapped-owner updates.');
  }finally{
    await query('DELETE FROM github_deliveries WHERE delivery_id=ANY($1::uuid[])',[deliveries]);
    for(const account of accounts)await account.cleanup();
  }
}
