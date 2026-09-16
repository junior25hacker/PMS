import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter.
 *
 * Every error that leaves the application is normalised into a single
 * predictable envelope so the vanilla-JS frontend never has to guess at the
 * shape of a failure:
 *
 * ```json
 * { "success": false, "statusCode": 400, "error": "Bad Request",
 *   "message": "SKU already exists", "path": "/api/v1/medicines",
 *   "timestamp": "2026-09-15T10:00:00.000Z" }
 * ```
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (isHttp) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else {
        const body = payload as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Unhandled non-error exception: ${JSON.stringify(exception)}`);
    }

    // Postgres unique-violation surfaced by the driver.
    const pgCode = (exception as { code?: string })?.code;
    if (pgCode === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'A record with these unique values already exists',
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
