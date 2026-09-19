import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const {runEmailJobs}=await import('../lib/email-worker.js');
const watch=process.argv.includes('--watch');let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
do{
  try{console.log(JSON.stringify(await runEmailJobs()));}
  catch{console.error('Email worker failed. Check database connectivity.');if(!watch){process.exitCode=1;break;}}
  if(watch&&!stopping)await delay(5000);
}while(watch&&!stopping);
