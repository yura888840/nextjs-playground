import { readBytes } from './bounded-body.js';
export class EmailDeliveryError extends Error {
  constructor(code,retryable=true,retryAfter=0){super(code);this.code=code;this.retryable=retryable;this.retryAfter=retryAfter;}
}
export async function deliverEmail(job,fetcher=fetch){
  if(job.mode==='preview')return {preview:true};
  if(process.env.EMAIL_MODE!=='send'||!process.env.RESEND_API_KEY||!job.payload.from)throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
  let response;
  try{
    response=await fetcher('https://api.resend.com/emails',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`task-summary/${job.id}`},
      body:JSON.stringify({from:job.payload.from,to:[job.payload.to],subject:job.payload.subject,text:job.payload.text}),
    });
  }catch{throw new EmailDeliveryError('PROVIDER_UNAVAILABLE');}
  if(!response.ok){
    const wait=Number(response.headers.get('retry-after'));
    throw new EmailDeliveryError(`PROVIDER_HTTP_${response.status}`,response.status===429||response.status===409||response.status===408||response.status>=500,Number.isFinite(wait)?Math.min(3600,Math.max(0,Math.ceil(wait))):0);
  }
  let data;
  try{data=JSON.parse((await readBytes(response.body,16384)).toString('utf8'));}catch{throw new EmailDeliveryError('PROVIDER_INVALID_RESPONSE');}
  if(typeof data.id!=='string'||!data.id||data.id.length>200)throw new EmailDeliveryError('PROVIDER_INVALID_RESPONSE');
  return {id:data.id,preview:false};
}
