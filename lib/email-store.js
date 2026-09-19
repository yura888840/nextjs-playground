import { randomUUID } from 'node:crypto';
import { query, transaction } from './db.js';
export const jobView = row => ({
  id:row.id,mode:row.mode,status:row.status,attempts:row.attempts,errorCode:row.error_code,
  createdAt:row.created_at.toISOString(),completedAt:row.completed_at?.toISOString()||null,
  nextAttemptAt:row.status==='pending'?row.available_at.toISOString():null,
});
export async function enqueueTaskSummary(userId,requestId,mode){
  return transaction(async client=>{
    const owner=await client.query('SELECT email FROM users WHERE id=$1 FOR UPDATE',[userId]);
    if(!owner.rowCount)return {missing:true};
    const old=await client.query('SELECT * FROM email_jobs WHERE owner_id=$1 AND request_id=$2',[userId,requestId]);
    if(old.rowCount)return {job:jobView(old.rows[0]),duplicate:true};
    const recent=await client.query("SELECT id FROM email_jobs WHERE owner_id=$1 AND created_at>now()-interval '1 hour' LIMIT 1",[userId]);
    if(recent.rowCount)return {limited:true};
    const tasks=await client.query('SELECT title,status FROM tasks WHERE owner_id=$1 ORDER BY created_at,id LIMIT 101',[userId]);
    const lines=tasks.rows.slice(0,100).map(row=>`[${row.status}] ${row.title}`);
    const payload={...(mode==='send'?{from:process.env.EMAIL_FROM}:{}),to:owner.rows[0].email,subject:'Your task summary',text:`Your tasks at the time you requested this email:\n\n${lines.length?lines.join('\n'):'No tasks yet.'}${tasks.rows.length>100?'\n\nOnly the first 100 tasks are included.':''}`};
    const result=await client.query('INSERT INTO email_jobs(id,owner_id,request_id,mode,payload) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),userId,requestId,mode,payload]);
    return {job:jobView(result.rows[0]),duplicate:false};
  });
}
export async function listEmailJobs(ownerId){
  const result=await query('SELECT * FROM email_jobs WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[ownerId]);
  return result.rows.map(jobView);
}
export async function getEmailJob(id,ownerId){
  const result=await query('SELECT * FROM email_jobs WHERE id=$1 AND owner_id=$2',[id,ownerId]);
  const row=result.rows[0];return row?{...jobView(row),preview:row.payload}:null;
}
export async function claimEmailJob(){
  // Stop retrying before the provider's 24-hour idempotency retention expires.
  await query(`UPDATE email_jobs SET status='failed',error_code='EXPIRED_OR_EXHAUSTED',completed_at=now(),lease_token=NULL,lease_until=NULL
    WHERE (status='pending' OR (status='processing' AND lease_until<=now()))
    AND (created_at<=now()-interval '20 hours' OR attempts>=5)`);
  const result=await query(`WITH candidate AS (
    SELECT id FROM email_jobs WHERE attempts<5 AND created_at>now()-interval '20 hours'
    AND ((status='pending' AND available_at<=now()) OR (status='processing' AND lease_until<=now()))
    ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE email_jobs j SET status='processing',attempts=j.attempts+1,lease_token=$1,lease_until=now()+interval '2 minutes'
    FROM candidate c WHERE j.id=c.id RETURNING j.*`,[randomUUID()]);
  return result.rows[0]||null;
}
export async function finishEmailJob(job,result){
  return (await query(`UPDATE email_jobs SET status=$1,provider_id=$2,error_code=NULL,completed_at=now(),lease_token=NULL,lease_until=NULL
    WHERE id=$3 AND status='processing' AND lease_token=$4`,[result.preview?'previewed':'sent',result.id||null,job.id,job.lease_token])).rowCount>0;
}
export async function failEmailJob(job,failure){
  const terminal=!failure.retryable || job.attempts>=5;
  const backoff=Math.max(failure.retryAfter||0,Math.min(3600,30*2**(job.attempts-1))+Math.floor(Math.random()*10));
  return (await query(`UPDATE email_jobs SET status=$1,error_code=$2,available_at=now()+($3::int*interval '1 second'),
    completed_at=CASE WHEN $1='failed' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL
    WHERE id=$4 AND status='processing' AND lease_token=$5`,[terminal?'failed':'pending',failure.code,backoff,job.id,job.lease_token])).rowCount>0;
}
