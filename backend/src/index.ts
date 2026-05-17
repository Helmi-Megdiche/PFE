import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { logger } from './utils/logger';
import { scheduleDailyScoreJob } from './jobs/dailyScoreJob';

async function start() {
  const app = createApp();

  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established');
    scheduleDailyScoreJob();
  } catch (err) {
    logger.error('Database connection failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`API listening on port ${env.port}`, { env: env.nodeEnv });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Failed to start server', { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
