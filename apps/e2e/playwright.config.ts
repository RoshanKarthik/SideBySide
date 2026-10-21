import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * End-to-end tests for the acceptance flows. They run against `pnpm dev` (the web app on 5173
 * proxying to the Worker on 8787) and the development database, and reuse a server that is
 * already running.
 */
export default defineConfig({
  testDir: './tests',
  // Each flow drives two users against one shared dev server and database.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    // Wide enough for the interviewer panel to sit next to the room.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    cwd: root,
    // Answers only once both Vite and the Worker behind its proxy are up.
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
