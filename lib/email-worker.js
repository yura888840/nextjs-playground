import { claimEmailJob, finishEmailJob, failEmailJob } from './email-store.js';
import { deliverEmail, EmailDeliveryError } from './email-provider.js';
export async function runEmailJobs({limit=3,deliver=deliverEmail}={}){
  const result={processed:0,sent:0,previewed:0,retriedOrFailed:0};
  for(let i=0;i<limit;i++){
    const job=await claimEmailJob();if(!job)break;
    result.processed++;
    let delivery;
    try{delivery=await deliver(job);}
    catch(err){
      const failure=err instanceof EmailDeliveryError?err:new EmailDeliveryError('WORKER_ERROR');
      await failEmailJob(job,failure);result.retriedOrFailed++;continue;
    }
    // If the DB write fails, leave the lease for recovery; do not change the provider key.
    const finished=await finishEmailJob(job,delivery);
    if(finished)result[delivery.preview?'previewed':'sent']++;
  }
  return result;
}
