/**
 * Starts a real PostgreSQL server for local development without installing Postgres.
 * Uses the `embedded-postgres` npm package (official PostgreSQL binaries).
 *
 *   npm run db:local     → postgres://scalive:scalive@127.0.0.1:5433/scalive_quiz
 *
 * Data lives OUTSIDE the project folder by default (cloud-sync tools like OneDrive
 * corrupt live database files). Override with LOCAL_PG_DIR.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const baseDir =
  process.env.LOCAL_PG_DIR ||
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'scalive-quiz-arena', 'pgdata');
const port = Number(process.env.LOCAL_PG_PORT || 5433);
const database = 'scalive_quiz';

fs.mkdirSync(path.dirname(baseDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: baseDir,
  user: 'scalive',
  password: 'scalive',
  port,
  persistent: true,
  onLog: () => {},
  onError: (msg) => {
    const text = String(msg ?? '').trim();
    if (text && !/^\s*$/.test(text)) console.error('[postgres]', text);
  },
});

const initialised = fs.existsSync(path.join(baseDir, 'PG_VERSION'));
if (!initialised) {
  console.log(`[db] Initialising new PostgreSQL cluster in ${baseDir} …`);
  await pg.initialise();
}

await pg.start();
try {
  await pg.createDatabase(database);
  console.log(`[db] Created database "${database}"`);
} catch {
  // already exists
}
console.log(`[db] PostgreSQL ready → postgresql://scalive:scalive@127.0.0.1:${port}/${database}`);
console.log('[db] Press Ctrl+C to stop.');

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\n[db] Stopping PostgreSQL…');
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
