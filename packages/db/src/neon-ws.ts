/**
 * `pnpm db:migrate:ws` / `pnpm db:seed:ws` — the same as db:migrate and db:seed, but for a Neon
 * database reached over WebSockets on port 443, for networks that block Postgres's port 5432.
 * The deployed app is unaffected: Cloudflare reaches Neon over 5432 through Hyperdrive.
 */
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { fileURLToPath } from 'node:url';
import type { Database } from './index';
import * as schema from './schema';
import { seedPublicQuestions } from './seed/seed';

const command = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
if (command !== 'migrate' && command !== 'seed') {
  console.error('Usage: neon-ws.ts migrate|seed');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
try {
  if (command === 'migrate') {
    const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
    await migrate(db, { migrationsFolder });
    console.log(`Migrations applied to ${new URL(url).host}.`);
  } else {
    // Same query builder API as the node-postgres client the seed is written against.
    const count = await seedPublicQuestions(db as unknown as Database);
    console.log(`Seeded ${count} public questions.`);
  }
} finally {
  await pool.end();
}
