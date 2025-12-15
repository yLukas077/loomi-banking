import { RequestIdMiddleware } from '../../src/common/middleware/request-id.middleware';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-12345'),
}));

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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should set requestId on request object', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockRequest.requestId).toBe('mocked-uuid-12345');
  });

  it('should set x-request-id header on response', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'mocked-uuid-12345',
    );
  });

  it('should call next function', () => {
    middleware.use(mockRequest, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should generate unique requestId for each request', () => {
    const { v4: mockedUuid } = require('uuid');

    // First request
    mockedUuid.mockReturnValueOnce('uuid-request-1');
    middleware.use(mockRequest, mockResponse, mockNext);
    expect(mockRequest.requestId).toBe('uuid-request-1');

    // Second request
    const mockRequest2: any = {};
    mockedUuid.mockReturnValueOnce('uuid-request-2');
    middleware.use(mockRequest2, mockResponse, mockNext);
    expect(mockRequest2.requestId).toBe('uuid-request-2');
  });

  it('should set header before calling next', () => {
    const callOrder: string[] = [];

    mockResponse.setHeader = jest.fn(() => callOrder.push('setHeader'));
    mockNext = jest.fn(() => callOrder.push('next'));

    middleware.use(mockRequest, mockResponse, mockNext);

    expect(callOrder).toEqual(['setHeader', 'next']);
  });
});