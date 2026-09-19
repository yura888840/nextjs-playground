import { z } from 'zod';
const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
export const githubImportSchema = z.strictObject({
  owner: name, repo: name,
  issueNumber: z.number().int().min(1).max(2147483647),
});
export const githubIssueSchema = z.object({
  number: z.number().int().positive(), title: z.string().trim().min(1).max(4096).refine(value => !value.includes('\0')),
  state: z.enum(['open','closed']), updated_at: z.iso.datetime(),
  pull_request: z.unknown().optional(),
});
export const githubEventSchema = z.object({
  action: z.enum(['edited','closed','reopened']),
  repository: z.object({ full_name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/) }),
  issue: githubIssueSchema,
});
