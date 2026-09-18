import { z } from 'zod';

export const taskStatuses = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
export const titleLimit = 200;
const title = z.string({ error: 'Title must be a string.' }).trim()
  .min(1, 'Enter a task title.')
  .refine(value => value.length <= titleLimit, 'Title must be at most 200 characters.');
const status = z.enum(['todo', 'in_progress', 'done'], {
  error: 'Choose To do, In progress, or Done.',
});

// Keep defaults out of PATCH: omitted properties must stay unchanged.
export const createTaskSchema = z.strictObject({ title, status: status.default('todo') });
export const updateTaskSchema = z.strictObject({ title: title.optional(), status: status.optional() })
  .refine(value => value.title !== undefined || value.status !== undefined, 'Provide a title or status to update.');
export const taskIdSchema = z.uuid({ error: 'Task ID must be a valid UUID.' });

export function validationDetails(error) {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return { fieldErrors, formErrors };
}
