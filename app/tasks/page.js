'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './tasks.module.css';

const statuses = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

async function api(path = '', options = {}) {
  const response = await fetch(`/api/tasks${path}`, {
    cache: 'no-store', ...options, signal: options.signal ?? AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'The request failed. Please try again.');
  return body;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('todo');
  const [edit, setEdit] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const lock = useRef(false);
  const titleInput = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    api('', { signal: controller.signal })
      .then(data => { if (active) { setTasks(data.tasks); setLoaded(true); } })
      .catch(() => { if (active) setError('Could not load tasks. Use Refresh to try again.'); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  async function perform(action) {
    if (lock.current || loading) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (err) { setError(`${err.message} If the result is uncertain, refresh before retrying.`); }
    finally { lock.current = false; setBusy(false); }
  }

  async function create(event) {
    event.preventDefault();
    if (!title.trim()) return;
    await perform(async () => {
      const task = await api('', { method: 'POST', body: JSON.stringify({ title: title.trim(), status }) });
      setTasks(current => [...current, task]);
      setTitle('');
      setStatus('todo');
      setMessage('Task created.');
    });
    titleInput.current?.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (!edit.title.trim()) return;
    await perform(async () => {
      const task = await api(`/${encodeURIComponent(edit.id)}`, {
        method: 'PATCH', body: JSON.stringify({ title: edit.title.trim(), status: edit.status }),
      });
      setTasks(current => current.map(item => item.id === task.id ? task : item));
      setEdit(null);
      setMessage('Task updated.');
    });
  }

  const disabled = loading || busy;
  return <main className={styles.main}>
    <Link href="/" className={styles.back}>← Playground</Link>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>NEXT.JS PLAYGROUND</p><h1>Tasks</h1></div>
      <button className={styles.secondary} disabled={disabled} onClick={() => perform(async () => {
        const data = await api();
        setTasks(data.tasks); setLoaded(true); setEdit(null); setDeleting(null); setMessage('Tasks refreshed.');
      })}>Refresh</button>
    </div>
    <p className={styles.note}>Temporary demo: tasks may disappear after a restart or between hosted requests. Use disposable test data.</p>

    <form className={styles.create} onSubmit={create} aria-label="Create task">
      <div className={styles.field}><label htmlFor="new-title">Task title</label>
        <input ref={titleInput} id="new-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} placeholder="What needs to be done?" disabled={disabled || !loaded} />
      </div>
      <div className={styles.field}><label htmlFor="new-status">Status</label>
        <select id="new-status" value={status} onChange={event => setStatus(event.target.value)} disabled={disabled || !loaded}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <button disabled={disabled || !loaded || !title.trim()}>Add task</button>
    </form>

    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" className={styles.message}>{loading ? 'Loading tasks…' : busy ? 'Working…' : message}</p>

    <section className={styles.list} aria-label="Task list" aria-busy={disabled}>
      <h2>{loaded ? `Your tasks (${tasks.length})` : 'Your tasks'}</h2>
      {loaded && tasks.length === 0 && <p className={styles.empty}>No tasks yet. Add your first task above.</p>}
      <ul>{tasks.map(task => <li key={task.id} className={styles.row}>
        {edit?.id === task.id ? <form onSubmit={save} className={styles.edit} aria-label="Edit task">
          <div className={styles.field}><label htmlFor="edit-title">Task title</label>
            <input id="edit-title" autoFocus required maxLength={200} value={edit.title} onChange={event => setEdit({ ...edit, title: event.target.value })} disabled={disabled} />
          </div>
          <div className={styles.field}><label htmlFor="edit-status">Status</label>
            <select id="edit-status" value={edit.status} onChange={event => setEdit({ ...edit, status: event.target.value })} disabled={disabled}>
              {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className={styles.actions}><button disabled={disabled || !edit.title.trim()}>Save</button>
            <button type="button" className={styles.secondary} disabled={disabled} onClick={() => setEdit(null)}>Cancel</button></div>
        </form> : <>
          <div className={styles.task}><h3>{task.title}</h3><span className={styles.badge} data-status={task.status}>{statuses[task.status]}</span></div>
          {deleting === task.id ? <div className={styles.actions}>
            <span>Delete this task?</span>
            <button className={styles.danger} disabled={disabled} onClick={() => perform(async () => {
              await api(`/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
              setTasks(current => current.filter(item => item.id !== task.id));
              setDeleting(null); setMessage('Task deleted.');
            })}>Confirm delete</button>
            <button className={styles.secondary} disabled={disabled} onClick={() => setDeleting(null)}>Cancel</button>
          </div> : <div className={styles.actions}>
            <button className={styles.secondary} disabled={disabled} aria-label={`Edit ${task.title}`} onClick={() => { setEdit({ id: task.id, title: task.title, status: task.status }); setDeleting(null); }}>Edit</button>
            <button className={styles.secondary} disabled={disabled} aria-label={`Delete ${task.title}`} onClick={() => { setDeleting(task.id); setEdit(null); }}>Delete</button>
          </div>}
        </>}
      </li>)}</ul>
    </section>
  </main>;
}
