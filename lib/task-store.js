import { randomUUID } from 'node:crypto';
import { query } from './db.js';

function task(row) {
  return row ? {
    id: row.id, title: row.title, status: row.status,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  } : null;
}

export async function listTasks(ownerId, { q = '', status, page = 1, pageSize = 10, sort = 'oldest' } = {}) {
  // Only trusted SQL fragments are interpolated; all user values are parameters.
  const order = { oldest: 'created_at ASC, id ASC', newest: 'created_at DESC, id DESC', title: 'title ASC, id ASC' }[sort];
  if (!order) throw new Error('Unsupported task sort.');
  const result = await query(`WITH filtered AS (
    SELECT * FROM tasks WHERE owner_id = $1
      AND ($2::text IS NULL OR status = $2)
      AND strpos(lower(title), lower($3)) > 0
    )
    SELECT selected.*, totals.total FROM (SELECT count(*)::int AS total FROM filtered) totals
    LEFT JOIN LATERAL (SELECT * FROM filtered ORDER BY ${order} LIMIT $4 OFFSET $5) selected ON true
    ORDER BY ${order}`, [ownerId, status ?? null, q, pageSize, (page - 1) * pageSize]);
  const total = result.rows[0].total;
  const totalPages = Math.ceil(total / pageSize);
  return {
    tasks: result.rows.filter(row => row.id).map(task),
    pagination: { page, pageSize, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  };
}

export async function getTask(id, ownerId) {
  const result = await query('SELECT * FROM tasks WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return task(result.rows[0]);
}

export async function createTask({ title, status = 'todo' }, ownerId) {
  if (!ownerId) throw new Error('A task owner is required.');
  const result = await query(
    'INSERT INTO tasks (id, title, status, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [randomUUID(), title, status, ownerId],
  );
  return task(result.rows[0]);
}

export async function updateTask(id, changes, ownerId) {
  const result = await query(
    `UPDATE tasks SET title = COALESCE($2, title), status = COALESCE($3, status),
     updated_at = clock_timestamp() WHERE id = $1 AND owner_id = $4 RETURNING *`,
    [id, changes.title ?? null, changes.status ?? null, ownerId],
  );
  return task(result.rows[0]);
}

export async function deleteTask(id, ownerId) {
  return (await query('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, ownerId])).rowCount > 0;
}
