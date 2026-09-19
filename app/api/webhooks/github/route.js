import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BodyTooLarge, readBytes } from '../../../../lib/bounded-body.js';
import { githubEventSchema } from '../../../../lib/github-schema.js';
import { applyGithubDelivery } from '../../../../lib/github-store.js';
import { taskHandler } from '../../../../lib/task-handler.js';
import { error, json } from '../../../../lib/task-http.js';
export const runtime='nodejs';
export const POST=taskHandler(async request=>{
  const secret=process.env.GITHUB_WEBHOOK_SECRET;
  if(!secret || secret.length<32) return error('Webhook integration is not configured.',503,'INTEGRATION_DISABLED');
  let bytes;
  try { bytes=await readBytes(request.body,256*1024); }
  catch(err) { return error('Invalid webhook body.',err instanceof BodyTooLarge?413:400,'INVALID_WEBHOOK'); }
  const signature=request.headers.get('x-hub-signature-256')||'';
  if(!/^sha256=[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(bytes).digest())) return error('Invalid webhook signature.',401,'INVALID_SIGNATURE');
  const delivery=request.headers.get('x-github-delivery');
  if(!z.uuid().safeParse(delivery).success) return error('Invalid delivery ID.',400,'INVALID_WEBHOOK');
  let body;
  try { body=JSON.parse(bytes.toString('utf8')); } catch { return error('Invalid JSON.',400,'INVALID_JSON'); }
  if(request.headers.get('x-github-event')!=='issues' || !['edited','closed','reopened'].includes(body?.action)) return json({ignored:true},202);
  const parsed=githubEventSchema.safeParse(body);
  if(!parsed.success || parsed.data.issue.pull_request) return error('Invalid issue event.',422,'INVALID_WEBHOOK');
  const result=await applyGithubDelivery(delivery,createHash('sha256').update(bytes).digest('hex'),parsed.data);
  if(result.conflict) return error('Delivery ID was reused with a different payload.',409,'DELIVERY_CONFLICT');
  return json(result);
});
