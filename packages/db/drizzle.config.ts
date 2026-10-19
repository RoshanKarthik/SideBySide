import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    // Direct (unpooled) Neon connection string; migrations should not go through Hyperdrive.
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
});
