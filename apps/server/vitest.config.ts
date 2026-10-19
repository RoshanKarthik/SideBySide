import { defineConfig } from 'vitest/config';

// Route and permission tests run in Node against an in-memory Postgres (PGlite).
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
