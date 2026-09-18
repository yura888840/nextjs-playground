import { z } from 'zod';
export const credentialsSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address.'),
  password: z.string().min(15, 'Use at least 15 characters.').max(128, 'Use at most 128 characters.'),
});
