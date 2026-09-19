import { authenticated } from '../../../../../../lib/permissions.js';
import { error, noStore, validateTaskId } from '../../../../../../lib/task-http.js';
import { getAttachment, deleteAttachment } from '../../../../../../lib/attachment-store.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateIds(id, attachmentId) {
  return validateTaskId(id) || validateTaskId(attachmentId);
}
export const GET = authenticated(async (_request, { params }, user) => {
  const { id, attachmentId } = await params;
  const invalid = validateIds(id, attachmentId);
  if (invalid) return invalid;
  const row = await getAttachment(id, attachmentId, user.id);
  if (!row) return error('Attachment not found.', 404, 'NOT_FOUND');
  const filename = encodeURIComponent(row.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(row.content), { headers: {
    ...noStore,
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(row.size),
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${filename}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  } });
});
export const DELETE = authenticated(async (_request, { params }, user) => {
  const { id, attachmentId } = await params;
  const invalid = validateIds(id, attachmentId);
  if (invalid) return invalid;
  return await deleteAttachment(id, attachmentId, user.id)
    ? new Response(null, { status: 204, headers: noStore })
    : error('Attachment not found.', 404, 'NOT_FOUND');
});
