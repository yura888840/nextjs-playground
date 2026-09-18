export const noStore = { 'Cache-Control': 'no-store' };

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...noStore, ...headers } });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

// Minimal input checks for the CRUD exercise; schema validation comes next.
export async function readTaskInput(request, { partial = false } = {}) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { response: error('Request body must be valid JSON.') };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { response: error('Request body must be a JSON object.') };
  }
  const keys = Object.keys(body);
  if (keys.some(key => !['title', 'status'].includes(key))) {
    return { response: error('Only title and status can be supplied.') };
  }
  if (partial && keys.length === 0) {
    return { response: error('Provide title or status to update.') };
  }
  const data = {};
  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) {
      return { response: error('Title must contain 1 to 200 characters after trimming.') };
    }
    data.title = body.title.trim();
  }
  if (Object.hasOwn(body, 'status')) {
    if (!['todo', 'in_progress', 'done'].includes(body.status)) {
      return { response: error('Status must be todo, in_progress, or done.') };
    }
    data.status = body.status;
  }
  return { data };
}
