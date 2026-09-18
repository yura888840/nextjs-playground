import { deleteTask, getTask, updateTask } from '../../../../lib/task-store.js';
import { error, json, noStore, readTaskInput } from '../../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { id } = await params;
  const task = getTask(id);
  return task ? json(task) : error('Task not found.', 404);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!getTask(id)) return error('Task not found.', 404);
  const input = await readTaskInput(request, { partial: true });
  if (input.response) return input.response;
  // Recheck after reading the body: another request may have deleted the task.
  const task = updateTask(id, input.data);
  return task ? json(task) : error('Task not found.', 404);
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  return deleteTask(id)
    ? new Response(null, { status: 204, headers: noStore })
    : error('Task not found.', 404);
}
