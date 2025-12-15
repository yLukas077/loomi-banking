import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LogInterceptor } from '../../src/common/interceptors/log.interceptor';

describe('LogInterceptor', () => {
  let interceptor: LogInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new LogInterceptor();

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({
          method: 'POST',
          url: '/transactions',
          requestId: 'test-request-id-123',
        }),
      }),
    } as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ id: 'tx-1' })),
    };

    jest.spyOn(interceptor['logger'], 'log').mockImplementation();
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

  it('should log request on entry', (done) => {
    const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('REQUEST POST /transactions'),
        );
        done();
      },
    });
  });

  it('should log response with duration', (done) => {
    const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringMatching(/RESPONSE POST \/transactions.*duration=\d+ms/),
        );
        done();
      },
    });
  });

  it('should pass through the response data', (done) => {
    const responseData = { id: 'tx-1', amount: 100 };
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

  it('should include requestId in logs', (done) => {
    const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      complete: () => {
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('requestId=test-request-id-123'),
        );
        done();
      },
    });
  });
});
