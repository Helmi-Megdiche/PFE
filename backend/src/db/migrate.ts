import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    logger.info(`Running migration: ${file}`);
    await pool.query(sql);
  }
}

runMigrations()
  .then(() => {
    logger.info('Migrations completed');
    return pool.end();
  })
  .catch((err) => {
    logger.error('Migration failed', { err: err instanceof Error ? err.message : String(err) });
    void pool.end();
    process.exit(1);
  });
