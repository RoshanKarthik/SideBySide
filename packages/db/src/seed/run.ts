// `pnpm db:seed` — loads the public practice bank into DATABASE_URL.
import { config } from 'dotenv';
import { connectDb } from '../index';
import { seedPublicQuestions } from './seed';

config({
  path: new URL('../../../../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}
const handle = await connectDb(url);
try {
  const count = await seedPublicQuestions(handle.db);
  console.log(`Seeded ${count} public questions.`);
} finally {
  await handle.close();
}
