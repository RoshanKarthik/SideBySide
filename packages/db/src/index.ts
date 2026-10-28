import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export * from './schema';
export { schema };

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** Closes the connection; call it once the request (or job) is done. */
  close: () => Promise<void>;
}

/**
 * Opens one connection. On Cloudflare the connection string comes from Hyperdrive, which pools
 * connections at the edge, so a fresh client per request is the recommended pattern.
 */
export async function connectDb(connectionString: string): Promise<DbHandle> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

// Query helpers re-exported so every package uses this package's single drizzle-orm instance.
export {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
