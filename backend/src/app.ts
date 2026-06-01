import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', apiRoutes);

  app.use(errorHandler);

  return app;
}
