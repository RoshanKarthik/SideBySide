// Generates BETTER_AUTH_SECRET and GUEST_TOKEN_SECRET and stores them as secrets of the deployed
// Worker. The values go straight from this process to `wrangler secret put` and are never
// printed. Run once after the first deploy; running it again rotates them (signing everyone out).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

for (const name of ['BETTER_AUTH_SECRET', 'GUEST_TOKEN_SECRET']) {
  const value = randomBytes(48).toString('base64url');
  const result = spawnSync('npx', ['wrangler', 'secret', 'put', name], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`Could not set ${name}.`);
    process.exit(result.status ?? 1);
  }
}
console.log('Both secrets are set.');
