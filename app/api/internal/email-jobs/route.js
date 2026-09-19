import { timingSafeEqual } from 'node:crypto';
import { runEmailJobs } from '../../../../lib/email-worker.js';
import { taskHandler } from '../../../../lib/task-handler.js';
import { json,error } from '../../../../lib/task-http.js';
export const runtime='nodejs';
export const maxDuration=60;
export const POST=taskHandler(async request=>{
  const secret=process.env.EMAIL_WORKER_SECRET;
  if(!secret||secret.length<32)return error('Email worker is not configured.',503,'WORKER_DISABLED');
  const expected=Buffer.from(`Bearer ${secret}`);const actual=Buffer.from(request.headers.get('authorization')||'');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return error('Worker authorization required.',401,'UNAUTHORIZED');
  return json(await runEmailJobs());
});
