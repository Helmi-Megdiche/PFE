import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtIssuer: process.env.JWT_ISSUER ?? 'pfe-parental-control',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  isProduction: process.env.NODE_ENV === 'production',
  /** Minutes to suppress a new risky-content mission after one was created. */
  missionRiskCooldownMinutes: Number(
    process.env.MISSION_RISK_COOLDOWN_MINUTES ??
      (process.env.NODE_ENV === 'production' ? 15 : 2),
  ),
} as const;
