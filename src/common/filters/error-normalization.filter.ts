import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

interface NormalizedError {
  code: string;
  message: string;
  field?: string;
}

@Catch()
export class ErrorNormalizationFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status: (code: number) => { json: (body: NormalizedError) => void } }>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const normalized = this.normalizeBody(body);
      response.status(exception.getStatus()).json(normalized);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }

  private normalizeBody(body: string | object): NormalizedError {
    if (typeof body === 'string') {
      return { code: body, message: body };
    }

    const candidate = body as Partial<NormalizedError> & { error?: string };
    return {
      code: candidate.code ?? candidate.error ?? 'ERROR',
      message: candidate.message ?? 'Request failed',
      field: candidate.field,
    };
  }
}
