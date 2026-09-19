import { authenticated } from '../../../../lib/permissions.js';
import { listEmailJobs } from '../../../../lib/email-store.js';
import { json } from '../../../../lib/task-http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=authenticated(async(_request,_context,user)=>json({jobs:await listEmailJobs(user.id)}));
