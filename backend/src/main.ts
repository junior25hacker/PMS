import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });

  // ---------------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------------
  app.use(
    helmet({
      // The Swagger UI ships inline scripts/styles; keep CSP relaxed in dev.
      contentSecurityPolicy: config.get('env', { infer: true }) === 'production'
        ? undefined
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // CORS — the vanilla-JS frontend is served from a different origin
  // ---------------------------------------------------------------------------
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ---------------------------------------------------------------------------
  // Global validation: strips unknown properties, transforms payloads into DTO
  // class instances so class-validator / class-transformer kick in.
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
      stopAtFirstError: false,
    }),
  );

  app.setGlobalPrefix(apiPrefix);

  // ---------------------------------------------------------------------------
  // Swagger / OpenAPI documentation
  // ---------------------------------------------------------------------------
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pharmly — Pharmacy Management System API')
    .setDescription(
      [
        'REST API for pharmacy inventory, point of sale, suppliers and analytics.',
        '',
        '**Roles**',
        '- `admin` — full access',
        '- `pharmacist` — inventory, batches, suppliers, purchases',
        '- `cashier` — point of sale and read-only catalog',
        '',
        'Authenticate via `POST /auth/login` then click **Authorize** and paste the access token.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'bearer',
    )
    .addTag('Authentication')
    .addTag('Dashboard')
    .addTag('Medicines')
    .addTag('Batches')
    .addTag('Suppliers')
    .addTag('Purchase Orders')
    .addTag('Sales & POS')
    .addTag('Users')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    customSiteTitle: 'Pharmly API Docs',
  });

  // ---------------------------------------------------------------------------
  // Static frontend — serve the vanilla-JS SPA from the API's own origin when
  // the folder exists, so the app runs on a single URL with no CORS setup.
  // API routes take precedence; unknown paths fall back to index.html.
  // ---------------------------------------------------------------------------
  const candidateDirs = [
    path.resolve(process.cwd(), '..', 'frontend'),
    path.resolve(process.cwd(), 'frontend'),
    path.resolve(__dirname, '..', '..', 'frontend'),
    path.resolve(__dirname, '..', '..', '..', 'frontend'),
  ];
  try {
    const fs = await import('node:fs');
    const frontendDir = candidateDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
    if (frontendDir) {
      app.useStaticAssets(frontendDir, { index: 'index.html' });
      const express = await import('express');
      const router = express.Router();
      router.get(/^\/(?!(api|assets)\/).*/, (_req, res) => {
        res.sendFile(path.join(frontendDir, 'index.html'));
      });
      app.use(router);
      logger.log(`Serving frontend from ${frontendDir}`);
    }
  } catch {
    // Static serving is optional — API-only deployments work as before.
  }

  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`Pharmly API listening on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger UI:                http://localhost:${port}/${apiPrefix}/docs`);
  logger.log(`Environment:               ${config.get('env', { infer: true })}`);
}

void bootstrap();
