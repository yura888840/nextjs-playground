import { randomUUID } from 'node:crypto';
import { query, transaction } from './db.js';
export async function allowGithubImport(userId) {
  const { rows } = await query(`INSERT INTO github_import_limits(user_id,attempts,reset_at) VALUES($1,1,now()+interval '1 hour')
    ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN github_import_limits.reset_at<=now() THEN 1 ELSE github_import_limits.attempts+1 END,
    reset_at=CASE WHEN github_import_limits.reset_at<=now() THEN now()+interval '1 hour' ELSE github_import_limits.reset_at END RETURNING attempts`,[userId]);
  return rows[0].attempts <= 20;
}
export async function importGithubIssue(ownerId, repository, issue) {
  return transaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[ownerId]);
    const existing=await client.query('SELECT task_id FROM github_task_links WHERE owner_id=$1 AND repository=$2 AND issue_number=$3',[ownerId,repository,issue.number]);
    if(existing.rowCount) return { taskId:existing.rows[0].task_id, created:false };
    const id=randomUUID();
    await client.query('INSERT INTO tasks(id,owner_id,title,status) VALUES($1,$2,$3,$4)',[id,ownerId,issue.title.slice(0,200),issue.state==='closed'?'done':'todo']);
    await client.query('INSERT INTO github_task_links(task_id,owner_id,repository,issue_number,external_updated_at) VALUES($1,$2,$3,$4,$5)',[id,ownerId,repository,issue.number,issue.updated_at]);
    return {taskId:id,created:true};
  });
}
export async function applyGithubDelivery(deliveryId, payloadHash, event) {
  return transaction(async client => {
    const inserted=await client.query('INSERT INTO github_deliveries(delivery_id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING delivery_id',[deliveryId,payloadHash]);
    if(!inserted.rowCount) {
      const previous=await client.query('SELECT payload_hash FROM github_deliveries WHERE delivery_id=$1',[deliveryId]);
      return {duplicate:previous.rows[0].payload_hash===payloadHash,conflict:previous.rows[0].payload_hash!==payloadHash};
    }
    // Lock links in deterministic order. Older/equal events never roll back newer state.
    const {rows}=await client.query(`SELECT * FROM github_task_links WHERE repository=$1 AND issue_number=$2 ORDER BY task_id FOR UPDATE`,[event.repository.full_name.toLowerCase(),event.issue.number]);
    let updated=0;
    for(const link of rows) {
      if(Date.parse(event.issue.updated_at)<=link.external_updated_at.getTime()) continue;
      const task=await client.query(`UPDATE tasks SET title=$1,status=$2,updated_at=clock_timestamp() WHERE id=$3 AND owner_id=$4`,[event.issue.title.slice(0,200),event.issue.state==='closed'?'done':'todo',link.task_id,link.owner_id]);
      await client.query('UPDATE github_task_links SET external_updated_at=$1 WHERE task_id=$2',[event.issue.updated_at,link.task_id]);
      updated+=task.rowCount;
    }
    return {duplicate:false,updated};
  });
}
