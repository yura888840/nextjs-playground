import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser, sessionCookie } from '../../lib/auth.js';
import TaskManager from './task-manager.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function TasksPage() {
  const user = await currentUser((await cookies()).get(sessionCookie)?.value);
  if (!user) redirect('/account');
  return <TaskManager />;
}
