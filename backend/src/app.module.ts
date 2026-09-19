import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { BatchesModule } from './modules/batches/batches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthController } from './modules/health/health.controller';
import { MedicinesModule } from './modules/medicines/medicines.module';
import { PatientsModule } from './modules/patients/patients.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SalesModule } from './modules/sales/sales.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Root module.
 *
 * Cross-cutting concerns are registered once here through Nest's `APP_*`
 * tokens so that every controller automatically gets:
 *  - global exception normalisation     (AllExceptionsFilter)
 *  - JWT authentication on every route  (JwtAuthGuard, opt-out with @Public)
 *  - role based access control          (RolesGuard, opt-in with @Roles)
 *  - a consistent success envelope      (TransformInterceptor)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    MedicinesModule,
    BatchesModule,
    PurchasesModule,
    SalesModule,
    DashboardModule,
    PatientsModule,
    PrescriptionsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
