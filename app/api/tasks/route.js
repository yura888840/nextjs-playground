import { authenticated } from '../../../lib/permissions.js';
import { createTask, listTasks } from '../../../lib/task-store.js';
import { parseTaskList } from '../../../lib/task-list-schema.js';
import { validationDetails } from '../../../lib/task-schema.js';
import { error, json, readTaskInput, methodNotAllowed } from '../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = authenticated(async (request, _context, user) => {
  const parsed = parseTaskList(new URL(request.url).searchParams);
  if (parsed.duplicate) return error('Query parameters must not be repeated.', 400, 'INVALID_QUERY');
  if (!parsed.success) return error('Invalid task filters.', 400, 'INVALID_QUERY', validationDetails(parsed.error));
  return json(await listTasks(user.id, parsed.data));
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
