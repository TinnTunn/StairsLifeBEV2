// Filter galat global yang menyeragamkan bentuk respons kesalahan.

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { tentukanKode } from './kode-galat';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const isi =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : null;
    const message = isi && 'message' in isi ? isi.message : exception.message;

    const kode =
      isi && typeof isi.code === 'string'
        ? {
            code: isi.code,
            params: isi.params as Record<string, string | number> | undefined,
          }
        : tentukanKode(status, message);

    response.status(status).json({
      success: false,
      statusCode: status,
      code: kode.code,
      ...(kode.params ? { params: kode.params } : {}),
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
