import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { err: err.message });
});

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    logger.debug('SQL query executed', {
      durationMs: Date.now() - start,
      rowCount: result.rowCount,
    });
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  } catch (err) {
    logger.error('SQL query failed', {
      durationMs: Date.now() - start,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
