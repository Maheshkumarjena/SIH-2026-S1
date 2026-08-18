import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

interface NormalizedError {
  code: string;
  message: string;
  field?: string;
}

@Catch()
export class ErrorNormalizationFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status: (code: number) => { json: (body: NormalizedError) => void } }>();
    const request = http.getRequest<{ method?: string; originalUrl?: string; url?: string }>();

    const method = request?.method ?? 'UNKNOWN';
    const url = request?.originalUrl ?? request?.url ?? 'UNKNOWN';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const normalized = this.normalizeBody(body);

      console.error(
        `\n┌─ ⚠️  [EXCEPTION FILTER] ${method} ${url} -> ${status}\n` +
        `│  Code: ${normalized.code}\n` +
        `│  Message: ${normalized.message}\n` +
        (normalized.field ? `│  Field: ${normalized.field}\n` : '') +
        `└───────────────────────────────────────────────────`
      );

      response.status(status).json(normalized);
      return;
    }

    const unexpected = exception instanceof Error ? exception : new Error(String(exception));
    console.error(
      `\n┌─ 💥 [UNHANDLED EXCEPTION] ${method} ${url} -> 500 INTERNAL_ERROR\n` +
      `│  Error: ${unexpected.message}\n` +
      `│  Stack: ${unexpected.stack ?? 'No stack trace available'}\n` +
      `└───────────────────────────────────────────────────`
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }

  private normalizeBody(body: string | object): NormalizedError {
    if (typeof body === 'string') {
      return { code: body, message: body };
    }

    const candidate = body as Partial<NormalizedError> & {
      error?: string;
      message?: string | string[];
    };

    let message = 'Request failed';
    if (Array.isArray(candidate.message)) {
      message = candidate.message.join(', ');
    } else if (typeof candidate.message === 'string') {
      message = candidate.message;
    }

    return {
      code: candidate.code ?? candidate.error ?? 'ERROR',
      message,
      field: candidate.field,
    };
  }
}

