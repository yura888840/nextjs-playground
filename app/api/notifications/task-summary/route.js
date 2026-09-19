import { z } from 'zod';
import { authenticated } from '../../../../lib/permissions.js';
import { readBytes, BodyTooLarge } from '../../../../lib/bounded-body.js';
import { enqueueTaskSummary } from '../../../../lib/email-store.js';
import { error,json } from '../../../../lib/task-http.js';
export const runtime='nodejs';
const schema=z.strictObject({requestId:z.uuid()});
export const POST=authenticated(async(request,_context,user)=>{
  const mode=process.env.EMAIL_MODE||'preview';
  if(!['preview','send'].includes(mode)||(mode==='send'&&(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)))return error('Email delivery is not configured.',503,'EMAIL_NOT_CONFIGURED');
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return error('Use application/json.',415,'UNSUPPORTED_MEDIA_TYPE');
  let body;
  try{body=JSON.parse((await readBytes(request.body,1024)).toString('utf8'));}
  catch(err){return error('Invalid request.',err instanceof BodyTooLarge?413:400,'INVALID_REQUEST');}
  const parsed=schema.safeParse(body);
  if(!parsed.success)return error('Provide one requestId UUID.',422,'VALIDATION_ERROR');
  const result=await enqueueTaskSummary(user.id,parsed.data.requestId,mode);
  if(result.missing)return error('Sign in to continue.',401,'UNAUTHENTICATED');
  if(result.limited)return error('You can request one summary per hour.',429,'RATE_LIMITED',{}, {'Retry-After':'3600'});
  return json(result,result.duplicate?200:202,{'Location':`/api/notifications/jobs/${result.job.id}`});
});
