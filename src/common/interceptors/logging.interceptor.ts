import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

interface SanitizedUser {
  id?: string;
  role?: string;
  department_id?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      ip?: string;
      body?: unknown;
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
      user?: SanitizedUser;
    }>();
    const res = http.getResponse<{ statusCode?: number }>();

    const { method } = req;
    const url = req.originalUrl ?? req.url;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    const startTime = Date.now();

    const userInfo = req.user
      ? `${req.user.id ?? 'unknown'} (${req.user.role ?? 'unknown_role'})`
      : 'Anonymous';

    const sanitizedParams = this.sanitize(req.params);
    const sanitizedQuery = this.sanitize(req.query);
    const sanitizedBody = this.sanitize(req.body);

    const hasParams = sanitizedParams && Object.keys(sanitizedParams).length > 0;
    const hasQuery = sanitizedQuery && Object.keys(sanitizedQuery).length > 0;
    const hasBody = sanitizedBody && Object.keys(sanitizedBody).length > 0;

    const requestDetails: string[] = [];
    requestDetails.push(`Caller: ${userInfo} | IP: ${req.ip ?? 'unknown'}`);
    if (hasParams) requestDetails.push(`Params: ${JSON.stringify(sanitizedParams)}`);
    if (hasQuery) requestDetails.push(`Query: ${JSON.stringify(sanitizedQuery)}`);
    if (hasBody) requestDetails.push(`Body: ${this.formatPayload(sanitizedBody)}`);

    console.log(
      `\n┌─ 📥 [HTTP REQUEST] ${method} ${url} (${controllerName}.${handlerName})\n` +
      requestDetails.map((line) => `│  ${line}`).join('\n') +
      `\n└───────────────────────────────────────────────────`
    );

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode ?? 200;
        const sanitizedResponse = this.sanitize(data);

        console.log(
          `\n┌─ ✅ [HTTP SUCCESS] ${method} ${url} -> ${statusCode} OK (+${duration}ms) [${controllerName}.${handlerName}]\n` +
          `│  Response: ${this.formatPayload(sanitizedResponse)}\n` +
          `└───────────────────────────────────────────────────\n`
        );
      }),
      catchError((err: unknown) => {
        const duration = Date.now() - startTime;
        const statusCode =
          (err as { getStatus?: () => number })?.getStatus?.() ??
          (err as { status?: number })?.status ??
          500;

        const errorResponse =
          (err as { getResponse?: () => unknown })?.getResponse?.() ??
          (err as { message?: string })?.message ??
          'Unknown Error';

        console.error(
          `\n┌─ ❌ [HTTP ERROR] ${method} ${url} -> ${statusCode} (+${duration}ms) [${controllerName}.${handlerName}]\n` +
          `│  Details: ${this.formatPayload(errorResponse)}\n` +
          `└───────────────────────────────────────────────────\n`
        );

        throw err;
      }),
    );
  }

  private sanitize(input: unknown): unknown {
    if (input === null || input === undefined) {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitize(item));
    }

    if (typeof input === 'object') {
      const sanitized: Record<string, unknown> = {};
      const sensitiveKeys = new Set([
        'password',
        'password_hash',
        'refresh_token',
        'access_token',
        'token',
        'secret',
        'authorization',
        'cookie',
      ]);

      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitize(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return input;
  }

  private formatPayload(payload: unknown): string {
    if (payload === undefined) return 'undefined';
    if (payload === null) return 'null';
    try {
      const str = JSON.stringify(payload, null, 2);
      if (str.length > 2000) {
        return `${str.substring(0, 2000)}... (truncated ${str.length - 2000} chars)`;
      }
      return str;
    } catch {
      return String(payload);
    }
  }
}
