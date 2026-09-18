import { createTaskSchema, updateTaskSchema, taskIdSchema, validationDetails } from './task-schema.js';

export const noStore = { 'Cache-Control': 'no-store' };

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...noStore, ...headers } });
}

export function error(message, status = 400, code = 'BAD_REQUEST', details = {}, headers = {}) {
  return json({ error: { code, message, fieldErrors: {}, formErrors: [], ...details } }, status, headers);
}

export function validateTaskId(id) {
  const result = taskIdSchema.safeParse(id);
  return result.success ? null : error('Invalid task ID.', 400, 'INVALID_ID', {
    fieldErrors: { id: result.error.issues.map(issue => issue.message) },
  });
}

export function methodNotAllowed(allow) {
  return error('Method not allowed.', 405, 'METHOD_NOT_ALLOWED', {}, { Allow: allow });
}

export async function readTaskInput(request, { partial = false } = {}) {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { response: error('Use Content-Type: application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE') };
  }
  let body;
  try { body = await request.json(); }
  catch { return { response: error('Request body must be valid JSON.', 400, 'INVALID_JSON') }; }
  const result = (partial ? updateTaskSchema : createTaskSchema).safeParse(body);
  if (!result.success) {
    return { response: error('Please correct the highlighted fields.', 422, 'VALIDATION_ERROR', validationDetails(result.error)) };
  }
  return { data: result.data };
}
