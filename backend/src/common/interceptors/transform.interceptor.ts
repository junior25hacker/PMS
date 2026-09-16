import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

/**
 * Wraps every successful handler result so that errors and successes share
 * the same top-level shape (`success`, `statusCode`, `timestamp`).
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiEnvelope<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode;
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
