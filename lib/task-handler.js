import { DatabaseUnavailableError } from './db.js';
import { error } from './task-http.js';

export function taskHandler(handler) {
  return async (...args) => {
    try { return await handler(...args); }
    catch (failure) {
      if (!(failure instanceof DatabaseUnavailableError)) throw failure;
      return error('Task storage is temporarily unavailable. Please try again.', 503, 'DATABASE_UNAVAILABLE');
    }
  };
}
