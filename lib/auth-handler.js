import { credentialsSchema } from './auth-schema.js';
import { validationDetails } from './task-schema.js';
import { authenticate, allowAttempt, checkOrigin, cookieHeader, readSessionToken } from './auth.js';
import { error, json } from './task-http.js';
import { taskHandler } from './task-handler.js';

export function credentialsHandler(register) {
  return taskHandler(async request => {
    const originError = checkOrigin(request);
    if (originError) return originError;
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return error('Use Content-Type: application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    // Bound the body before parsing, including chunked requests.
    const reader = request.body?.getReader();
    let body = '';
    let size = 0;
    if (reader) {
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return error('Request body is too large.', 413, 'BODY_TOO_LARGE'); }
        chunks.push(Buffer.from(value));
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    let data;
    try { data = JSON.parse(body); }
    catch { return error('Request body must be valid JSON.', 400, 'INVALID_JSON'); }
    const parsed = credentialsSchema.safeParse(data);
    if (!parsed.success) return error('Please correct the highlighted fields.', 422, 'VALIDATION_ERROR', validationDetails(parsed.error));
    if (!(await allowAttempt(parsed.data.email))) return error('Too many attempts. Try again in 15 minutes.', 429, 'RATE_LIMITED', {}, { 'Retry-After': '900' });
    const result = await authenticate(parsed.data, register, readSessionToken(request));
    if (!result) return register
      ? error('Unable to create this account. Try signing in.', 409, 'ACCOUNT_UNAVAILABLE')
      : error('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    return json({ user: result.user }, register ? 201 : 200, { 'Set-Cookie': cookieHeader(result.token) });
  });
}
