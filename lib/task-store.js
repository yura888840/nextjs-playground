import { randomUUID } from 'node:crypto';

// Educational, process-local storage. Never use this as a persistent database.
// A global key shares the Map across separately bundled routes in one process.
const key = Symbol.for('nextjs-playground.tasks');
const tasks = globalThis[key] ??= new Map();

export function listTasks() {
  return Array.from(tasks.values(), task => ({ ...task }));
}

export function getTask(id) {
  const task = tasks.get(id);
  return task ? { ...task } : null;
}

export function createTask({ title, status = 'todo' }) {
  const now = new Date().toISOString();
  const task = { id: randomUUID(), title, status, createdAt: now, updatedAt: now };
  tasks.set(task.id, task);
  return { ...task };
}

export function updateTask(id, changes) {
  const task = tasks.get(id);
  if (!task) return null;
  const updated = { ...task, ...changes, updatedAt: new Date().toISOString() };
  tasks.set(id, updated);
  return { ...updated };
}

export function deleteTask(id) {
  return tasks.delete(id);
}
