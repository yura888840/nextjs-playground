import { existsSync } from 'node:fs';

export function testDatabaseUrl() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const value = process.env.TEST_DATABASE_URL;
  if (!value || !new URL(value).pathname.endsWith('_test')) {
    throw new Error('Set TEST_DATABASE_URL to a separate database whose name ends in _test.');
  }
  return value;
}
