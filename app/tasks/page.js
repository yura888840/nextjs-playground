'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './tasks.module.css';

import { createTaskSchema, updateTaskSchema, validationDetails, taskStatuses as statuses, titleLimit } from '../../lib/task-schema.js';

async function api(path = '', options = {}) {
  const response = await fetch(`/api/tasks${path}`, {
    cache: 'no-store', ...options, signal: options.signal ?? AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const failure = new Error(body?.error?.message || 'The request failed. Please try again.');
    failure.details = body?.error;
    failure.status = response.status;
    throw failure;
  }
  return body;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createErrors, setCreateErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
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

  async function perform(action, setFields) {
    if (lock.current || loading) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (err) {
      setFields?.(err.details?.fieldErrors || {});
      const messages = err.details?.formErrors || [];
      setError(messages.length ? messages.join(' ') : err.message);
    }
    finally { lock.current = false; setBusy(false); }
  }

  async function create(event) {
    event.preventDefault();
    const parsed = createTaskSchema.safeParse({ title, status });
    setCreateErrors({}); setError(''); setMessage('');
    if (!parsed.success) {
      const details = validationDetails(parsed.error);
      setCreateErrors(details.fieldErrors);
      setError(details.formErrors.join(' '));
      titleInput.current?.focus();
      return;
    }
    await perform(async () => {
      const task = await api('', { method: 'POST', body: JSON.stringify(parsed.data) });
      setTasks(current => [...current, task]);
      setTitle('');
      setStatus('todo');
      setMessage('Task created.');
    }, setCreateErrors);
    titleInput.current?.focus();
  }

  async function save(event) {
    event.preventDefault();
    const parsed = updateTaskSchema.safeParse({ title: edit.title, status: edit.status });
    setEditErrors({}); setError(''); setMessage('');
    if (!parsed.success) {
      const details = validationDetails(parsed.error);
      setEditErrors(details.fieldErrors);
      setError(details.formErrors.join(' '));
      document.getElementById('edit-title')?.focus();
      return;
    }
    await perform(async () => {
      const task = await api(`/${encodeURIComponent(edit.id)}`, {
        method: 'PATCH', body: JSON.stringify(parsed.data),
      });
      setTasks(current => current.map(item => item.id === task.id ? task : item));
      setEdit(null);
      setMessage('Task updated.');
    }, setEditErrors);
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
    <p className={styles.note}>Shared demo: tasks are saved on the server and visible to everyone. Use test data only.</p>

    <form className={styles.create} onSubmit={create} noValidate aria-label="Create task">
      <div className={styles.field}><label htmlFor="new-title">Task title</label>
        <input ref={titleInput} id="new-title" aria-invalid={!!createErrors.title} aria-describedby={createErrors.title ? "new-title-error" : undefined} value={title} onChange={event => { setTitle(event.target.value); setCreateErrors(current => ({ ...current, title: undefined })); }} required maxLength={titleLimit} placeholder="What needs to be done?" disabled={disabled || !loaded} />
        {createErrors.title && <p id="new-title-error" role="alert" className={styles.fieldError}>{createErrors.title.join(' ')}</p>}
      </div>
      <div className={styles.field}><label htmlFor="new-status">Status</label>
        <select id="new-status" aria-invalid={!!createErrors.status} aria-describedby={createErrors.status ? "new-status-error" : undefined} value={status} onChange={event => { setStatus(event.target.value); setCreateErrors(current => ({ ...current, status: undefined })); }} disabled={disabled || !loaded}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {createErrors.status && <p id="new-status-error" role="alert" className={styles.fieldError}>{createErrors.status.join(' ')}</p>}
      </div>
      <button disabled={disabled || !loaded}>Add task</button>
    </form>

    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" className={styles.message}>{loading ? 'Loading tasks…' : busy ? 'Working…' : message}</p>

    <section className={styles.list} aria-label="Task list" aria-busy={disabled}>
      <h2>{loaded ? `Your tasks (${tasks.length})` : 'Your tasks'}</h2>
      {loaded && tasks.length === 0 && <p className={styles.empty}>No tasks yet. Add your first task above.</p>}
      <ul>{tasks.map(task => <li key={task.id} className={styles.row}>
        {edit?.id === task.id ? <form onSubmit={save} noValidate className={styles.edit} aria-label="Edit task">
          <div className={styles.field}><label htmlFor="edit-title">Task title</label>
            <input id="edit-title" aria-invalid={!!editErrors.title} aria-describedby={editErrors.title ? "edit-title-error" : undefined} autoFocus required maxLength={titleLimit} value={edit.title} onChange={event => { setEdit({ ...edit, title: event.target.value }); setEditErrors(current => ({ ...current, title: undefined })); }} disabled={disabled} />
            {editErrors.title && <p id="edit-title-error" role="alert" className={styles.fieldError}>{editErrors.title.join(' ')}</p>}
          </div>
          <div className={styles.field}><label htmlFor="edit-status">Status</label>
            <select id="edit-status" aria-invalid={!!editErrors.status} aria-describedby={editErrors.status ? "edit-status-error" : undefined} value={edit.status} onChange={event => { setEdit({ ...edit, status: event.target.value }); setEditErrors(current => ({ ...current, status: undefined })); }} disabled={disabled}>
              {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {editErrors.status && <p id="edit-status-error" role="alert" className={styles.fieldError}>{editErrors.status.join(' ')}</p>}
          </div>
          <div className={styles.actions}><button disabled={disabled}>Save</button>
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
            <button className={styles.secondary} disabled={disabled} aria-label={`Edit ${task.title}`} onClick={() => { setEditErrors({}); setError(''); setEdit({ id: task.id, title: task.title, status: task.status }); setDeleting(null); }}>Edit</button>
            <button className={styles.secondary} disabled={disabled} aria-label={`Delete ${task.title}`} onClick={() => { setDeleting(task.id); setEdit(null); }}>Delete</button>
          </div>}
        </>}
      </li>)}</ul>
    </section>
  </main>;
}
