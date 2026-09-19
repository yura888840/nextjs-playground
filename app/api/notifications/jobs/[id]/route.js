import { authenticated } from '../../../../../lib/permissions.js';
import { getEmailJob } from '../../../../../lib/email-store.js';
import { json,error,validateTaskId } from '../../../../../lib/task-http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=authenticated(async(_request,{params},user)=>{
  const {id}=await params;const invalid=validateTaskId(id);if(invalid)return invalid;
  const job=await getEmailJob(id,user.id);return job?json({job}):error('Job not found.',404,'NOT_FOUND');
});
