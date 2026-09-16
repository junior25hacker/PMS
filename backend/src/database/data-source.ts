import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  Batch,
  Category,
  Medicine,
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
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'pharmly',
  entities: [
    User,
    Category,
    Supplier,
    Medicine,
    Batch,
    PurchaseOrder,
    PurchaseOrderItem,
    Sale,
    SaleItem,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});

export default AppDataSource;
