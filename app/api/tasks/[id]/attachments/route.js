import { authenticated } from '../../../../../lib/permissions.js';
import { json, error, validateTaskId } from '../../../../../lib/task-http.js';
import { getTask } from '../../../../../lib/task-store.js';
import { listAttachments, createAttachment } from '../../../../../lib/attachment-store.js';
import { readAttachment } from '../../../../../lib/attachment-input.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = authenticated(async (_request, { params }, user) => {
  const { id } = await params;
  const invalid = validateTaskId(id);
  if (invalid) return invalid;
  if (!(await getTask(id, user.id))) return error('Task not found.', 404, 'NOT_FOUND');
  return json({ attachments: await listAttachments(id, user.id) });
});
export const POST = authenticated(async (request, { params }, user) => {
  const { id } = await params;
  const invalid = validateTaskId(id);
  if (invalid) return invalid;
  // Check ownership before buffering/parsing file contents.
  if (!(await getTask(id, user.id))) return error('Task not found.', 404, 'NOT_FOUND');
  const input = await readAttachment(request);
  if (input.response) return input.response;
  const result = await createAttachment(id, user.id, input.data);
  if (result.missing) return error('Task not found.', 404, 'NOT_FOUND');
  if (result.quota) return error('Attachment limit reached: 10 files per task and 20 MiB per account.', 409, 'ATTACHMENT_QUOTA');
  return json(result.attachment, 201, { Location: `/api/tasks/${id}/attachments/${result.attachment.id}` });
});
