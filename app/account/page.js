'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { credentialsSchema } from '../../lib/auth-schema.js';
import { validationDetails } from '../../lib/task-schema.js';
import styles from '../tasks/tasks.module.css';

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Unable to load your account.');
        setUser(data.user);
      }).catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(''); setFields({});
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) { setFields(validationDetails(parsed.error).fieldErrors); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) { setFields(data.error?.fieldErrors || {}); throw new Error(data.error?.message || 'Sign-in failed.'); }
      setPassword(''); setUser(data.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      setUser(null); setPassword('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className={styles.main}>
    <Link href="/" className={styles.back}>← Playground</Link>
    <h1>{user ? 'Your account' : register ? 'Create an account' : 'Sign in'}</h1>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading ? <p role="status">Loading account…</p> : user ? <>
      <p>Signed in as {user.email}</p>
      <p><Link href="/tasks">Open task manager</Link></p>
      <button onClick={logout} disabled={busy}>Sign out</button>
    </> : <form onSubmit={submit} noValidate>
      <div className={styles.field}><label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'email-error' : undefined} />
        {fields.email && <p id="email-error" role="alert">{fields.email.join(' ')}</p>}
      </div>
      <div className={styles.field}><label htmlFor="password">Password (15–128 characters)</label>
        <input id="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-error' : undefined} />
        {fields.password && <p id="password-error" role="alert">{fields.password.join(' ')}</p>}
      </div>
      <div className={styles.actions}>
        <button disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setRegister(!register); setFields({}); setError(''); }}>{register ? 'Already have an account?' : 'Create an account'}</button>
      </div>
    </form>}
  </main>;
}
