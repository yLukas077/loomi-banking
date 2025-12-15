import { RequestIdMiddleware } from '../../src/common/middleware/request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();

    mockRequest = {};

    mockResponse = {
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should set requestId on request object', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockRequest.requestId).toBeDefined();
    expect(typeof mockRequest.requestId).toBe('string');
  });

  it('should set X-Request-Id header on response', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      mockRequest.requestId,
    );
  });

  it('should call next function', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should generate UUID format requestId', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(mockRequest.requestId).toMatch(uuidRegex);
  });

  it('should generate unique requestId for each request', () => {
    const mockRequest2: any = {};

    middleware.use(mockRequest, mockResponse, mockNext);
    middleware.use(mockRequest2, mockResponse, mockNext);

    expect(mockRequest.requestId).not.toBe(mockRequest2.requestId);
  });
});
