import { defineConfig } from 'vitest/config';

// Tests run against an in-memory Postgres (PGlite); starting it and migrating is slow when
// every package's tests run in parallel.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
