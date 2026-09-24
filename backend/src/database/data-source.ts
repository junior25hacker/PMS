import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  Batch,
  Category,
  Medicine,
  Patient,
  Prescription,
  PrescriptionItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  Supplier,
  User,
} from '../modules/entities';

loadEnv();

/**
 * Standalone DataSource used by the TypeORM CLI (migrations) and by
 * `src/database/seed.ts`. The Nest runtime builds its own connection from
 * the same environment variables inside `DatabaseModule`.
 */
const entities = [
  User,
  Category,
  Supplier,
  Medicine,
  Batch,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  Patient,
  Prescription,
  PrescriptionItem,
];

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

const getDataSource = (): DataSource => {
  if (isPostgres) {
    return new DataSource({
      type: 'postgres',
      url: databaseUrl || undefined,
      host: databaseUrl ? undefined : (process.env.DB_HOST ?? 'localhost'),
      port: databaseUrl
        ? undefined
        : Number.parseInt(process.env.DB_PORT ?? '5432', 10),
      username: databaseUrl ? undefined : (process.env.DB_USER ?? 'postgres'),
      password: databaseUrl ? undefined : (process.env.DB_PASSWORD ?? 'postgres'),
      database: databaseUrl ? undefined : (process.env.DB_NAME ?? 'pharmly'),
      ssl,
      entities,
      migrations: ['src/database/migrations/*.ts'],
      synchronize: false,
      logging: false,
    });
  }

  // Lazy-load sqlite3 only in local development when SQLite is used
  let sqlite3Driver: any;
  try {
    sqlite3Driver = require('sqlite3');
  } catch {
    // sqlite3 native module not required when running PostgreSQL
  }

  return new DataSource({
    type: 'sqlite',
    database: 'pharmly.sqlite',
    driver: sqlite3Driver,
    entities,
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
    logging: false,
  });
};

export const AppDataSource = getDataSource();

export default AppDataSource;
