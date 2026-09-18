import { deleteTask, getTask, updateTask } from '../../../../lib/task-store.js';
import { error, json, noStore, readTaskInput, validateTaskId, methodNotAllowed } from '../../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  const task = getTask(id);
  return task ? json(task) : error('Task not found.', 404, 'NOT_FOUND');
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  if (!getTask(id)) return error('Task not found.', 404, 'NOT_FOUND');
  const input = await readTaskInput(request, { partial: true });
  if (input.response) return input.response;
  // Recheck after reading the body: another request may have deleted the task.
  const task = updateTask(id, input.data);
  return task ? json(task) : error('Task not found.', 404, 'NOT_FOUND');
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const invalidId = validateTaskId(id);
  if (invalidId) return invalidId;
  return deleteTask(id)
    ? new Response(null, { status: 204, headers: noStore })
    : error('Task not found.', 404, 'NOT_FOUND');
}

export const POST = () => methodNotAllowed('GET, HEAD, PATCH, DELETE, OPTIONS');
export const PUT = POST;
