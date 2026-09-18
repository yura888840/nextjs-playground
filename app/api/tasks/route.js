import { createTask, listTasks } from '../../../lib/task-store.js';
import { json, readTaskInput } from '../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return json({ tasks: listTasks() });
}

export async function POST(request) {
  const input = await readTaskInput(request);
  if (input.response) return input.response;
  const task = createTask(input.data);
  return json(task, 201, { Location: `/api/tasks/${task.id}` });
}
