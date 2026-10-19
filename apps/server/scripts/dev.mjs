// Starts `wrangler dev` with the repo-root .env loaded, so local Hyperdrive points at the
// development database (CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
// wrangler refuses to start if the static assets folder is missing.
mkdirSync(`${root}apps/web/dist`, { recursive: true });

const child = spawn('wrangler', ['dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
