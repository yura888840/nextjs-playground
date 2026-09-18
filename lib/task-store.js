import { randomUUID } from 'node:crypto';
import { query } from './db.js';

function task(row) {
  return row ? {
    id: row.id, title: row.title, status: row.status,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  } : null;
}

export async function listTasks() {
  const result = await query('SELECT * FROM tasks ORDER BY created_at, id');
  return result.rows.map(task);
}

export async function getTask(id) {
  const result = await query('SELECT * FROM tasks WHERE id = $1', [id]);
  return task(result.rows[0]);
}

export async function createTask({ title, status = 'todo' }) {
  const result = await query(
    'INSERT INTO tasks (id, title, status) VALUES ($1, $2, $3) RETURNING *',
    [randomUUID(), title, status],
  );
  return task(result.rows[0]);
}

export async function updateTask(id, changes) {
  const result = await query(
    `UPDATE tasks SET title = COALESCE($2, title), status = COALESCE($3, status),
     updated_at = clock_timestamp() WHERE id = $1 RETURNING *`,
    [id, changes.title ?? null, changes.status ?? null],
  );
  return task(result.rows[0]);
}

export async function deleteTask(id) {
  return (await query('DELETE FROM tasks WHERE id = $1', [id])).rowCount > 0;
}
