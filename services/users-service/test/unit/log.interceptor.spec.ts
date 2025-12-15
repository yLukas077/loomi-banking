import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LogInterceptor } from '../../src/common/interceptors/log.interceptor';

describe('LogInterceptor', () => {
  let interceptor: LogInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LogInterceptor();

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          requestId: 'test-request-id-123',
        }),
      }),
    } as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'test' })),
    };

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should call next.handle()', (done) => {
    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        expect(mockCallHandler.handle).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should log request details after completion', (done) => {
    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        expect(consoleSpy).toHaveBeenCalled();
        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData).toMatchObject({
          requestId: 'test-request-id-123',
          method: 'GET',
          url: '/test',
        });
        done();
      },
    });
  });

  it('should include duration in log', (done) => {
    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData).toHaveProperty('duration');
        expect(typeof loggedData.duration).toBe('number');
        done();
      },
    });
  });

  it('should include timestamp in log', (done) => {
    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData).toHaveProperty('timestamp');
        expect(loggedData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        done();
      },
    });
  });

  it('should handle POST requests', (done) => {
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          method: 'POST',
          url: '/users',
          requestId: 'post-request-id',
        }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData.method).toBe('POST');
        expect(loggedData.url).toBe('/users');
        done();
      },
    });
  });

  it('should pass through the response data', (done) => {
    const responseData = { id: 1, name: 'Test' };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(responseData));

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (data) => {
        expect(data).toEqual(responseData);
      },
      complete: () => {
        done();
      },
    });
  });

  it('should handle requests without requestId', (done) => {
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          method: 'GET',
          url: '/health',
          requestId: undefined,
        }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
        expect(loggedData.requestId).toBeUndefined();
        done();
      },
    });
  });
});