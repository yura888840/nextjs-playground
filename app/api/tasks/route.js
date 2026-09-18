import { taskHandler } from '../../../lib/task-handler.js';
import { createTask, listTasks } from '../../../lib/task-store.js';
import { json, readTaskInput, methodNotAllowed } from '../../../lib/task-http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = taskHandler(async () => {
  return json({ tasks: await listTasks() });
});

export const POST = taskHandler(async (request) => {
  const input = await readTaskInput(request);
  if (input.response) return input.response;
  const task = await createTask(input.data);
  return json(task, 201, { Location: `/api/tasks/${task.id}` });
});

export const PUT = () => methodNotAllowed('GET, HEAD, POST, OPTIONS');
export const PATCH = PUT;
export const DELETE = PUT;
