import { credentialsHandler } from '../../../../lib/auth-handler.js';
export const runtime = 'nodejs';
export const POST = credentialsHandler(true);
