import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sqlite3 from 'sqlite3';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration';
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

/**
 * Owns the database connection. Synchronizes schema in demo/dev mode.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('db', { infer: true });
        const candidateDbPaths = [
          path.resolve(process.cwd(), 'pharmly.sqlite'),
          path.resolve(process.cwd(), 'backend', 'pharmly.sqlite'),
          path.resolve(__dirname, '..', '..', 'pharmly.sqlite'),
          path.resolve(__dirname, '..', '..', '..', 'backend', 'pharmly.sqlite'),
        ];
        const dbPath =
          candidateDbPaths.find((p) => {
            try {
              return fs.existsSync(p);
            } catch {
              return false;
            }
          }) ?? path.resolve(process.cwd(), 'pharmly.sqlite');

        return {
          type: 'sqlite' as const,
          database: dbPath,
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
          synchronize: db.synchronize,
          logging: db.logging,
          autoLoadEntities: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
