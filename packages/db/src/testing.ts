import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import type { Database, DbHandle } from './index';
import * as schema from './schema';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url).href);

/** An in-memory Postgres (PGlite) with all migrations applied, for tests. */
export async function createTestDb(): Promise<DbHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Database, close: () => client.close() };
}
