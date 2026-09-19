import { z } from 'zod';

const integer = (fallback, max) => z.string().regex(/^[1-9]\d*$/, 'Use a positive integer.')
  .transform(Number).refine(value => Number.isSafeInteger(value) && value <= max, `Use a number from 1 to ${max}.`).default(fallback);
export const taskListSchema = z.strictObject({
  q: z.string().trim().max(200, 'Search must be at most 200 characters.').default(''),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  page: integer(1, 10000),
  pageSize: integer(10, 100),
  sort: z.enum(['oldest', 'newest', 'title']).default('oldest'),
});

export function parseTaskList(searchParams) {
  const entries = [...searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    return { duplicate: true };
  }
  return taskListSchema.safeParse(Object.fromEntries(entries));
}
