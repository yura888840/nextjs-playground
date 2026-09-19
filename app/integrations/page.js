'use client';
import Link from 'next/link';
import { useState } from 'react';
import styles from '../tasks/tasks.module.css';
export default function IntegrationsPage(){
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [result,setResult]=useState(null);
  async function submit(event){
    event.preventDefault(); if(busy)return;
    const data=new FormData(event.currentTarget); setBusy(true); setError(''); setResult(null);
    try{
      const response=await fetch('/api/integrations/github/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:data.get('owner'),repo:data.get('repo'),issueNumber:Number(data.get('issueNumber'))}),signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(response.status===401){window.location.assign('/account');return;}
      if(!response.ok)throw new Error(body.error?.message||'Import failed.');
      setResult(body);
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <main className={styles.main}><Link href="/tasks">← Tasks</Link><h1>GitHub issue import</h1>
    <p>Import a public GitHub issue into your task list. Repeating an import returns the same task. Pull requests are not supported.</p>
    <form onSubmit={submit} className={styles.create}>
      <div className={styles.field}><label htmlFor="owner">Repository owner</label><input id="owner" name="owner" required maxLength={100} disabled={busy}/></div>
      <div className={styles.field}><label htmlFor="repo">Repository name</label><input id="repo" name="repo" required maxLength={100} disabled={busy}/></div>
      <div className={styles.field}><label htmlFor="issue">Issue number</label><input id="issue" name="issueNumber" type="number" min={1} max={2147483647} required disabled={busy}/></div>
      <button disabled={busy}>{busy?'Importing…':'Import issue'}</button>
    </form>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {result&&<p role="status">{result.created?'Task imported.':'This issue was already imported.'} <Link href="/tasks">Open tasks</Link> · <a href={result.sourceUrl} target="_blank" rel="noreferrer">Source issue</a></p>}
  </main>;
}
