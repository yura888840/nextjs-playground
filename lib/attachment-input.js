import { error } from './task-http.js';
import { maxAttachmentBytes } from './attachment-policy.js';
const maxBodyBytes = maxAttachmentBytes + 16 * 1024;
const types = { txt: 'text/plain', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const rejected = message => ({ response: error(message, 422, 'INVALID_FILE', { fieldErrors: { file: [message] } }) });

export function validateFile(filename, mediaType, content) {
  const safeName = filename.split(/[\\/]/).pop().replace(/[\p{C}]/gu, '').trim();
  if (!safeName || safeName.length > 120) return rejected('Use a filename from 1 to 120 characters.');
  const extension = safeName.split('.').pop().toLowerCase();
  if (!types[extension] || mediaType !== types[extension]) return rejected('Upload a TXT, PDF, PNG or JPEG with a matching file type.');
  if (!content.length) return rejected('The file must not be empty.');
  if (content.length > maxAttachmentBytes) return { response: error('Files must be at most 1 MiB.', 413, 'FILE_TOO_LARGE') };
  let valid = false;
  if (extension === 'txt') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text);
    } catch {}
  } else if (extension === 'pdf') valid = content.subarray(0, 5).toString() === '%PDF-';
  else if (extension === 'png') valid = content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  else valid = content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255;
  if (!valid) return rejected('The file content does not match its declared type.');
  return { data: { filename: safeName, mediaType, content, size: content.length } };
}

export async function readAttachment(request) {
  const type = request.headers.get('content-type') || '';
  if (type.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') {
    return { response: error('Use multipart/form-data with one file field.', 415, 'UNSUPPORTED_MEDIA_TYPE') };
  }
  if (Number(request.headers.get('content-length')) > maxBodyBytes) {
    return { response: error('Upload request is too large.', 413, 'FILE_TOO_LARGE') };
  }
  const reader = request.body?.getReader();
  if (!reader) return rejected('Select a file.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return { response: error('Upload request is too large.', 413, 'FILE_TOO_LARGE') };
      }
      chunks.push(Buffer.from(value));
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type } }).formData();
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0][0] !== 'file' || typeof entries[0][1] === 'string') {
      return rejected('Send exactly one file field and no other fields.');
    }
    const file = entries[0][1];
    return validateFile(file.name, file.type, Buffer.from(await file.arrayBuffer()));
  } catch {
    return { response: error('Malformed multipart upload.', 400, 'INVALID_MULTIPART') };
  } finally { reader.releaseLock(); }
}
