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
 * Owns the PostgreSQL connection. `synchronize` is enabled only when
 * `DB_SYNCHRONIZE=true` (development / demo); production deployments should
 * run migrations instead.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('db', { infer: true });
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
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
