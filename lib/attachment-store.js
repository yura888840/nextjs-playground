import { randomUUID } from 'node:crypto';
import { query, transaction } from './db.js';
import { maxAttachmentsPerTask, maxAccountAttachmentBytes } from './attachment-policy.js';

export const attachmentMetadata = row => ({
  id: row.id, taskId: row.task_id, filename: row.filename, mediaType: row.media_type,
  size: row.size, createdAt: row.created_at.toISOString(),
});
export async function listAttachments(taskId, ownerId) {
  const { rows } = await query(`SELECT a.id,a.task_id,a.filename,a.media_type,a.size,a.created_at
    FROM task_attachments a JOIN tasks t ON t.id=a.task_id
    WHERE t.id=$1 AND t.owner_id=$2 ORDER BY a.created_at,a.id`, [taskId, ownerId]);
  return rows.map(attachmentMetadata);
}
export async function createAttachment(taskId, ownerId, file) {
  return transaction(async client => {
    // Serialize uploads per owner so concurrent requests cannot bypass the quota.
    const owner = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
    if (!owner.rowCount) return { missing: true };
    const task = await client.query('SELECT id FROM tasks WHERE id=$1 AND owner_id=$2 FOR UPDATE', [taskId, ownerId]);
    if (!task.rowCount) return { missing: true };
    const { rows } = await client.query(`SELECT count(*) FILTER (WHERE a.task_id=$1)::int AS task_count,
      COALESCE(sum(a.size),0)::bigint AS bytes FROM task_attachments a JOIN tasks t ON t.id=a.task_id
      WHERE t.owner_id=$2`, [taskId, ownerId]);
    if (rows[0].task_count >= maxAttachmentsPerTask || Number(rows[0].bytes) + file.size > maxAccountAttachmentBytes) return { quota: true };
    const result = await client.query(`INSERT INTO task_attachments(id,task_id,filename,media_type,size,content)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,task_id,filename,media_type,size,created_at`,
      [randomUUID(), taskId, file.filename, file.mediaType, file.size, file.content]);
    return { attachment: attachmentMetadata(result.rows[0]) };
  });
}
export async function getAttachment(taskId, attachmentId, ownerId) {
  const { rows } = await query(`SELECT a.* FROM task_attachments a JOIN tasks t ON t.id=a.task_id
    WHERE a.id=$1 AND t.id=$2 AND t.owner_id=$3`, [attachmentId, taskId, ownerId]);
  return rows[0] || null;
}
export async function deleteAttachment(taskId, attachmentId, ownerId) {
  const result = await query(`DELETE FROM task_attachments a USING tasks t
    WHERE a.task_id=t.id AND a.id=$1 AND t.id=$2 AND t.owner_id=$3`, [attachmentId, taskId, ownerId]);
  return result.rowCount > 0;
}
