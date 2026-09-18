import { taskHandler } from '../../../../lib/task-handler.js';
import { deleteTask, getTask, updateTask } from '../../../../lib/task-store.js';
import { error, json, noStore, readTaskInput, validateTaskId, methodNotAllowed } from '../../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = taskHandler(async (_request, { params }) => {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  const task = await getTask(id);
  return task ? json(task) : error('Task not found.', 404, 'NOT_FOUND');
});

export const PATCH = taskHandler(async (request, { params }) => {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  if (!(await getTask(id))) return error('Task not found.', 404, 'NOT_FOUND');
  const input = await readTaskInput(request, { partial: true });
  if (input.response) return input.response;
  // Recheck after reading the body: another request may have deleted the task.
  const task = await updateTask(id, input.data);
  return task ? json(task) : error('Task not found.', 404, 'NOT_FOUND');
});

export const DELETE = taskHandler(async (_request, { params }) => {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  return await deleteTask(id)
    ? new Response(null, { status: 204, headers: noStore })
    : error('Task not found.', 404, 'NOT_FOUND');
});

export const POST = () => methodNotAllowed('GET, HEAD, PATCH, DELETE, OPTIONS');
export const PUT = POST;
