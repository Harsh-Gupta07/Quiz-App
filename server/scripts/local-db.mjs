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
  // Always UTF-8: Windows otherwise defaults to WIN1252, which cannot store characters like → or emoji.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
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
const client = pg.getPgClient();
await client.connect();
const existing = await client.query(
  'SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1',
  [database],
);
if (existing.rowCount === 0) {
  await client.query(`CREATE DATABASE ${database} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  console.log(`[db] Created database "${database}" (UTF-8)`);
} else if (existing.rows[0].enc !== 'UTF8') {
  console.warn(
    `[db] WARNING: database "${database}" uses ${existing.rows[0].enc}, not UTF-8 — symbols like → cannot be saved.\n` +
      `[db] Stop this, delete ${baseDir} and run "npm run db:local" again to recreate it.`,
  );
}
await client.end();
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
