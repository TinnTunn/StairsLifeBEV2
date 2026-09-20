// Pembungkus respons sukses ke envelope success, data, message, timestamp.

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface ControllerResponse {
  data?: unknown;
  message?: string;
}

interface StandardResponse {
  success: boolean;
  data: unknown;
  message: string;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<
  T extends ControllerResponse,
> implements NestInterceptor<T, StandardResponse> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data?.data ?? data,
        message: data?.message ?? 'Berhasil',
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
