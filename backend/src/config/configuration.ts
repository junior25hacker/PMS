/**
 * Central, strongly-typed configuration factory.
 * Everything the app needs is read once here and consumed through
 * `ConfigService<AppConfig, true>` so that typos fail at compile time.
 */

export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  db: {
    type: 'sqlite' | 'postgres';
    url?: string;
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    synchronize: boolean;
    logging: boolean;
    ssl: boolean | { rejectUnauthorized: boolean };
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  bcryptSaltRounds: number;
  business: {
    defaultTaxRate: number;
    lowStockThreshold: number;
    expiryAlertDays: number;
  };
}

const toBool = (value: string | undefined, fallback = false): boolean =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toFloat = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default (): AppConfig => {
  const databaseUrl = process.env.DATABASE_URL;
  const dbTypeEnv = (process.env.DB_TYPE ?? '').toLowerCase();
  const isPostgres =
    dbTypeEnv === 'postgres' ||
    dbTypeEnv === 'postgresql' ||
    Boolean(databaseUrl);

  const urlIsLocal = databaseUrl
    ? databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
    : false;

  let ssl: boolean | { rejectUnauthorized: boolean } = false;
  if (process.env.DB_SSL === 'true') {
    ssl = { rejectUnauthorized: false };
  } else if (process.env.DB_SSL === 'false') {
    ssl = false;
  } else if (databaseUrl && !urlIsLocal) {
    ssl = { rejectUnauthorized: false };
  }

  return {
    env: process.env.NODE_ENV ?? 'development',
    port: toInt(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5500,http://127.0.0.1:5500')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    db: {
      type: isPostgres ? 'postgres' : 'sqlite',
      url: databaseUrl || undefined,
      host: process.env.DB_HOST ?? 'localhost',
      port: toInt(process.env.DB_PORT, 5432),
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      name: process.env.DB_NAME ?? 'pharmly',
      synchronize: toBool(process.env.DB_SYNCHRONIZE, true),
      logging: toBool(process.env.DB_LOGGING, false),
      ssl,
    },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-secret-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
    business: {
      defaultTaxRate: toFloat(process.env.DEFAULT_TAX_RATE, 0.12),
      lowStockThreshold: toInt(process.env.LOW_STOCK_THRESHOLD, 20),
      expiryAlertDays: toInt(process.env.EXPIRY_ALERT_DAYS, 90),
    },
  };
};
