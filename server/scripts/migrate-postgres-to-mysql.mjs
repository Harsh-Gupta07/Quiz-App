/**
 * One-time, transactional PostgreSQL -> MySQL data copy.
 *
 * Required environment variables:
 *   SOURCE_DATABASE_URL=postgresql://...   (old, read-only PostgreSQL)
 *   DATABASE_URL=mysql://...                (new, empty MySQL database)
 *
 * Run the MySQL Prisma migrations before this script. The target must be empty;
 * the script never deletes or overwrites existing rows.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl?.match(/^postgres(?:ql)?:\/\//i)) throw new Error('SOURCE_DATABASE_URL must be a PostgreSQL URL.');
if (!targetUrl?.match(/^mysql:\/\//i)) throw new Error('DATABASE_URL must be a MySQL URL.');
if (sourceUrl === targetUrl) throw new Error('Source and target database URLs must be different.');

const tables = [
  { name: 'Quiz', columns: ['id', 'title', 'description', 'timerSeconds', 'createdAt', 'updatedAt'] },
  { name: 'Question', columns: ['id', 'quizId', 'position', 'text', 'optionA', 'optionB', 'optionC', 'optionD', 'correct', 'explanation'] },
  { name: 'QuizSession', columns: ['id', 'code', 'quizId', 'title', 'status', 'stateVersion', 'currentIndex', 'revealedIndex', 'timerSeconds', 'lockJoinOnStart', 'questions', 'questionStartedAt', 'questionEndsAt', 'createdAt', 'startedAt', 'endedAt'], json: ['questions'], booleans: ['lockJoinOnStart'] },
  { name: 'Participant', columns: ['id', 'sessionId', 'name', 'nameKey', 'rollNo', 'tokenHash', 'joinedAt', 'lastSeenAt'] },
  { name: 'SeedRecord', columns: ['key', 'createdAt'] },
  { name: 'Response', columns: ['id', 'sessionId', 'participantId', 'questionIndex', 'questionId', 'choice', 'isCorrect', 'responseTimeMs', 'points', 'receivedAt'], booleans: ['isCorrect'] },
];

const quotePg = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteMy = (value) => `\`${value.replaceAll('`', '``')}\``;
const source = new pg.Client({ connectionString: sourceUrl, application_name: 'scalive-mysql-migration' });
const mysqlUrl = new URL(targetUrl);
mysqlUrl.searchParams.set('timezone', 'Z');
const target = await mysql.createConnection(mysqlUrl.toString());

async function insertBatches(table, rows) {
  const batchSize = 200;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => `(${table.columns.map(() => '?').join(',')})`).join(',');
    const values = batch.flatMap((row) => table.columns.map((column) => {
      const value = row[column];
      if (table.json?.includes(column)) return JSON.stringify(value);
      if (table.booleans?.includes(column)) return value ? 1 : 0;
      return value;
    }));
    await target.query(
      `INSERT INTO ${quoteMy(table.name)} (${table.columns.map(quoteMy).join(',')}) VALUES ${placeholders}`,
      values,
    );
  }
}

try {
  await source.connect();
  await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await target.query("SET time_zone = '+00:00'");

  // A non-empty target could mix old and new datasets, so fail without changing it.
  for (const table of tables) {
    const [rows] = await target.query(`SELECT COUNT(*) AS count FROM ${quoteMy(table.name)}`);
    if (Number(rows[0].count) !== 0) throw new Error(`Target table ${table.name} is not empty. No data was copied.`);
  }

  await target.beginTransaction();
  const expected = new Map();
  const expectedKeys = new Map();
  for (const table of tables) {
    const columns = table.columns.map(quotePg).join(',');
    const result = await source.query(`SELECT ${columns} FROM ${quotePg(table.name)} ORDER BY 1`);
    expected.set(table.name, result.rows.length);
    expectedKeys.set(table.name, result.rows.map((row) => String(row[table.columns[0]])).sort());
    await insertBatches(table, result.rows);
    console.log(`Copied ${result.rows.length} row(s): ${table.name}`);
  }

  for (const table of tables) {
    const [rows] = await target.query(`SELECT COUNT(*) AS count FROM ${quoteMy(table.name)}`);
    const actual = Number(rows[0].count);
    if (actual !== expected.get(table.name)) {
      throw new Error(`Validation failed for ${table.name}: expected ${expected.get(table.name)}, found ${actual}.`);
    }
    const [keyRows] = await target.query(
      `SELECT ${quoteMy(table.columns[0])} AS migrationKey FROM ${quoteMy(table.name)} ORDER BY 1`,
    );
    const actualKeys = keyRows.map((row) => String(row.migrationKey)).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys.get(table.name))) {
      throw new Error(`Validation failed for ${table.name}: primary keys differ.`);
    }
  }

  await target.commit();
  await source.query('COMMIT');
  console.log('Migration completed: all table counts match. PostgreSQL was read only and remains unchanged.');
} catch (error) {
  await target.rollback().catch(() => undefined);
  await source.query('ROLLBACK').catch(() => undefined);
  console.error(`Migration stopped safely: ${error.message}`);
  process.exitCode = 1;
} finally {
  await target.end().catch(() => undefined);
  await source.end().catch(() => undefined);
}
