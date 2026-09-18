import { authenticated } from '../../../lib/permissions.js';
import { createTask, listTasks } from '../../../lib/task-store.js';
import { json, readTaskInput, methodNotAllowed } from '../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = authenticated(async (_request, _context, user) => {
  return json({ tasks: await listTasks(user.id) });
});

export const POST = authenticated(async (request, _context, user) => {
  const input = await readTaskInput(request);
  if (input.response) return input.response;
  const task = await createTask(input.data, user.id);
  return json(task, 201, { Location: `/api/tasks/${task.id}` });
});

export const PUT = () => methodNotAllowed('GET, HEAD, POST, OPTIONS');
export const PATCH = PUT;
export const DELETE = PUT;
