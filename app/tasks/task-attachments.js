'use client';
import { useEffect, useRef, useState } from 'react';
import { attachmentAccept, maxAttachmentBytes } from '../../lib/attachment-policy.js';
import styles from './tasks.module.css';

export default function TaskAttachments({ taskId, disabled }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(null);
  const input = useRef(null);
  const lock = useRef(false);
  const base = `/api/tasks/${encodeURIComponent(taskId)}/attachments`;
  async function request(path = '', options = {}) {
    const response = await fetch(base + path, { cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
    if (response.status === 401) window.location.assign('/account');
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Attachment request failed.');
    return data;
  }
  useEffect(() => {
    const controller = new AbortController();
    request('', { signal: controller.signal }).then(data => { setFiles(data.attachments); setLoaded(true); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [taskId]);
  async function perform(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function upload(event) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) { setError('Select a file.'); return; }
    if (!file.size || file.size > maxAttachmentBytes) { setError('Choose a nonempty file of at most 1 MiB.'); return; }
    await perform(async () => {
      const form = new FormData(); form.set('file', file);
      const added = await request('', { method: 'POST', body: form });
      setFiles(current => [...current, added]); input.current.value = ''; setMessage('File uploaded.');
    });
  }
  return <section className={styles.attachments} aria-label="Task attachments" aria-busy={busy}>
    <h4>Attachments</h4>
    <p>TXT, PDF, PNG or JPEG · up to 1 MiB each · 10 files per task</p>
    <form onSubmit={upload} className={styles.actions}>
      <label>Choose attachment <input ref={input} type="file" accept={attachmentAccept} disabled={disabled || busy || !loaded} /></label>
      <button disabled={disabled || busy || !loaded || files.length >= 10}>Upload</button>
      <button type="button" className={styles.secondary} disabled={disabled || busy} onClick={() => perform(async () => {
        const data = await request(); setFiles(data.attachments); setLoaded(true); setConfirm(null);
      })}>Refresh files</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status">{busy ? 'Working…' : message}</p>
    {loaded && !files.length && <p>No attachments yet.</p>}
    <ul>{files.map(file => <li key={file.id} className={styles.attachmentRow}>
      <a href={`${base}/${file.id}`} download>{file.filename}</a> <span>{Math.ceil(file.size / 1024)} KiB</span>
      {confirm === file.id ? <>
        <span>Delete this file?</span>
        <button className={styles.danger} disabled={disabled || busy} onClick={() => perform(async () => {
          await request(`/${file.id}`, { method: 'DELETE' });
          setFiles(current => current.filter(item => item.id !== file.id)); setConfirm(null); setMessage('File deleted.');
        })}>Confirm delete</button>
        <button className={styles.secondary} disabled={disabled || busy} onClick={() => setConfirm(null)}>Cancel</button>
      </> : <button className={styles.secondary} disabled={disabled || busy} onClick={() => setConfirm(file.id)}>Delete file</button>}
    </li>)}</ul>
  </section>;
}
