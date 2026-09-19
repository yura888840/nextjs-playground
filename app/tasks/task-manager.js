'use client';

import Link from 'next/link';
import TaskAttachments from './task-attachments.js';
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
    if (response.status === 401) window.location.assign('/account');
    throw failure;
  }
  return body;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', sort: 'oldest', pageSize: '10' });
  const [applied, setApplied] = useState({ q: '', status: '', sort: 'oldest', pageSize: '10' });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });

  function listPath(values, page) {
    const params = new URLSearchParams({ page: String(page), pageSize: values.pageSize, sort: values.sort });
    if (values.q.trim()) params.set('q', values.q.trim());
    if (values.status) params.set('status', values.status);
    return `?${params}`;
  }
  async function reload(values = applied, page = pagination.page) {
    let data = await api(listPath(values, page));
    // A delete or filter change may remove the last row on the current page.
    if (page > Math.max(1, data.pagination.totalPages)) {
      data = await api(listPath(values, Math.max(1, data.pagination.totalPages)));
    }
    setTasks(data.tasks); setPagination(data.pagination); setApplied(values);
    setLoaded(true); setEdit(null); setDeleting(null);
  }
  async function reloadAfterWrite() {
    try { await reload(); }
    catch { setLoaded(false); setTasks([]); setError('The change was saved, but the list could not refresh. Use Refresh before making another change.'); }
  }
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
  const [attachmentsFor, setAttachmentsFor] = useState(null);
  const lock = useRef(false);
  const titleInput = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    api('', { signal: controller.signal })
      .then(data => { if (active) { setTasks(data.tasks); setPagination(data.pagination); setLoaded(true); } })
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
      await api('', { method: 'POST', body: JSON.stringify(parsed.data) });
      setTitle('');
      setStatus('todo');
      setMessage('Task created. Your filters and page are unchanged.');
      await reloadAfterWrite();
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
      await api(`/${encodeURIComponent(edit.id)}`, {
        method: 'PATCH', body: JSON.stringify(parsed.data),
      });
      setEdit(null);
      setMessage('Task updated.');
      await reloadAfterWrite();
    }, setEditErrors);
  }

  const disabled = loading || busy;
  return <main className={styles.main}>
    <Link href="/" className={styles.back}>← Playground</Link>
    <p><Link href="/account">Account / Sign in</Link> · <Link href="/integrations">Import GitHub issue</Link></p>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>NEXT.JS PLAYGROUND</p><h1>Tasks</h1></div>
      <button className={styles.secondary} disabled={disabled} onClick={() => perform(async () => {
        await reload(); setMessage('Tasks refreshed.');
      })}>Refresh</button>
    </div>
    <p className={styles.note}>Only your account can access these tasks. Tasks are saved on the server.</p>

    <form className={styles.filters} aria-label="Search tasks" onSubmit={event => {
      event.preventDefault(); perform(() => reload(filters, 1));
    }}>
      <div className={styles.field}><label htmlFor="task-search">Search titles</label>
        <input id="task-search" type="search" maxLength={200} value={filters.q} disabled={disabled} onChange={event => setFilters({ ...filters, q: event.target.value })} />
      </div>
      <div className={styles.field}><label htmlFor="filter-status">Filter status</label>
        <select id="filter-status" value={filters.status} disabled={disabled} onChange={event => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className={styles.field}><label htmlFor="task-sort">Sort</label>
        <select id="task-sort" value={filters.sort} disabled={disabled} onChange={event => setFilters({ ...filters, sort: event.target.value })}>
          <option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="title">Title</option>
        </select>
      </div>
      <div className={styles.field}><label htmlFor="page-size">Tasks per page</label>
        <select id="page-size" value={filters.pageSize} disabled={disabled} onChange={event => setFilters({ ...filters, pageSize: event.target.value })}>
          {['10', '25', '50'].map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      <button disabled={disabled}>Apply filters</button>
      <button type="button" className={styles.secondary} disabled={disabled} onClick={() => {
        const defaults = { q: '', status: '', sort: 'oldest', pageSize: '10' };
        setFilters(defaults); perform(() => reload(defaults, 1));
      }}>Reset</button>
    </form>

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
      <h2>{loaded ? `Matching tasks (${pagination.total})` : 'Your tasks'}</h2>
      {loaded && tasks.length === 0 && <p className={styles.empty}>No matching tasks. Try different filters or add a task.</p>}
      {loaded && <nav className={styles.pagination} aria-label="Task pages">
        <button className={styles.secondary} disabled={disabled || !pagination.hasPrevious} onClick={() => perform(() => reload(applied, pagination.page - 1))}>Previous</button>
        <span aria-live="polite">Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
        <button className={styles.secondary} disabled={disabled || !pagination.hasNext} onClick={() => perform(() => reload(applied, pagination.page + 1))}>Next</button>
      </nav>}
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
              setDeleting(null); setMessage('Task deleted.');
              await reloadAfterWrite();
            })}>Confirm delete</button>
            <button className={styles.secondary} disabled={disabled} onClick={() => setDeleting(null)}>Cancel</button>
          </div> : <div className={styles.actions}>
            <button className={styles.secondary} disabled={disabled} aria-label={`Edit ${task.title}`} onClick={() => { setEditErrors({}); setError(''); setEdit({ id: task.id, title: task.title, status: task.status }); setDeleting(null); }}>Edit</button>
            <button className={styles.secondary} disabled={disabled} aria-label={`Delete ${task.title}`} onClick={() => { setDeleting(task.id); setEdit(null); }}>Delete</button>
          </div>}
        </>}
        <div className={styles.attachmentSection}>
          <button className={styles.secondary} disabled={disabled} aria-expanded={attachmentsFor === task.id} onClick={() => setAttachmentsFor(attachmentsFor === task.id ? null : task.id)}>Attachments</button>
          {attachmentsFor === task.id && <TaskAttachments taskId={task.id} disabled={disabled} />}
        </div>
      </li>)}</ul>
    </section>
  </main>;
}
