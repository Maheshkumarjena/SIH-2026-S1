import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('logs incoming request and success response while redacting sensitive fields', (done) => {
    const mockRequest = {
      method: 'POST',
      url: '/auth/login',
      ip: '127.0.0.1',
      body: {
        email: 'user@example.com',
        password: 'supersecretpassword',
        token: 'secret-token-123',
      },
      params: { id: '1' },
      query: { ref: 'portal' },
      user: { id: 'u123', role: 'student' },
    };

    const mockResponse = {
      statusCode: 200,
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getClass: () => ({ name: 'AuthController' }),
      getHandler: () => ({ name: 'login' }),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of({ access_token: 'jwt-token-val', user: { id: 'u123' } }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ access_token: 'jwt-token-val', user: { id: 'u123' } });
        expect(consoleLogSpy).toHaveBeenCalledTimes(2);

        const firstLogCall = consoleLogSpy.mock.calls[0][0];
        expect(firstLogCall).toContain('[HTTP REQUEST] POST /auth/login (AuthController.login)');
        expect(firstLogCall).toContain('Caller: u123 (student)');
        expect(firstLogCall).toContain('"password": "[REDACTED]"');
        expect(firstLogCall).not.toContain('supersecretpassword');

        const secondLogCall = consoleLogSpy.mock.calls[1][0];
        expect(secondLogCall).toContain('[HTTP SUCCESS] POST /auth/login -> 200 OK');
        expect(secondLogCall).toContain('"access_token": "[REDACTED]"');
        done();
      },
    });
  });

  it('logs error response when handler throws', (done) => {
    const mockRequest = {
      method: 'GET',
      url: '/requests/999',
      ip: '127.0.0.1',
      params: { id: '999' },
      query: {},
    };

    const mockResponse = { statusCode: 404 };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getClass: () => ({ name: 'RequestsController' }),
      getHandler: () => ({ name: 'get' }),
    } as unknown as ExecutionContext;

    const mockError = {
      getStatus: () => 404,
      getResponse: () => ({ code: 'NOT_FOUND', message: 'Request not found' }),
    };

    const mockHandler: CallHandler = {
      handle: () => throwError(() => mockError),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      error: (err) => {
        expect(err).toBe(mockError);
        expect(consoleLogSpy).toHaveBeenCalledTimes(1); // request log
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // error log

        const errorLog = consoleErrorSpy.mock.calls[0][0];
        expect(errorLog).toContain('[HTTP ERROR] GET /requests/999 -> 404');
        expect(errorLog).toContain('NOT_FOUND');
        done();
      },
    });
  });
});
