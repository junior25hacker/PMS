import 'reflect-metadata';
import * as sqlite3 from 'sqlite3';
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
export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'pharmly.sqlite',
  driver: sqlite3,
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
    Patient,
    Prescription,
    PrescriptionItem,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});

export default AppDataSource;
