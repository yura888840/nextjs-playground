'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import styles from '../tasks/tasks.module.css';
export default function NotificationsPage(){
  const [jobs,setJobs]=useState([]);const [preview,setPreview]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const requestId=useRef(null);const lock=useRef(false);
  async function api(path='',options={}){
    const response=await fetch(`/api/notifications/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000),...options});
    if(response.status===401)window.location.assign('/account');
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Request failed.');return data;
  }
  async function refresh(){const data=await api('jobs');setJobs(data.jobs);}
  useEffect(()=>{refresh().catch(err=>setError(err.message));},[]);
  async function perform(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(err){setError(err.message);}finally{lock.current=false;setBusy(false);}}
  return <main className={styles.main}><Link href="/tasks">← Tasks</Link><h1>Email task summary</h1>
    <p>Queue a summary of your tasks for your account email. One request per hour. Preview mode prepares the message without sending it.</p>
    <div className={styles.actions}>
      <button disabled={busy} onClick={()=>perform(async()=>{
        requestId.current??=crypto.randomUUID();
        const data=await api('task-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current})});
        requestId.current=null;setMessage(data.job.mode==='preview'?'Summary queued in preview mode. No email will be sent.':'Email queued for background delivery.');
        setJobs(current=>[data.job,...current.filter(job=>job.id!==data.job.id)].slice(0,20));
      })}>Queue summary</button>
      <button disabled={busy} className={styles.secondary} onClick={()=>perform(refresh)}>Refresh status</button>
    </div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}<p role="status">{busy?'Working…':message}</p>
    <section className={styles.list}><h2>Recent jobs</h2><ul>{jobs.map(job=><li key={job.id} className={styles.row}>
      <span>{job.status} · {job.mode} · attempts: {job.attempts}{job.errorCode?` · ${job.errorCode}`:''}</span>
      <button className={styles.secondary} disabled={busy} onClick={()=>perform(async()=>{const data=await api(`jobs/${job.id}`);setPreview(data.job.preview);})}>View message</button>
    </li>)}</ul></section>
    {preview&&<section><h2>{preview.subject}</h2><p>To: {preview.to}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</pre></section>}
  </main>;
}
