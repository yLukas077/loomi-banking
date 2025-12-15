import { RedisService } from '../../src/redis/redis.service';

// Mock redis client
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new RedisService();
    
    // Simulate onModuleInit
    mockRedisClient.connect.mockResolvedValue(undefined);
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to Redis on init', async () => {
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should register error handler', async () => {
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('get', () => {
    it('should return value for existing key', async () => {
      const key = 'test-key';
      const value = 'test-value';
      mockRedisClient.get.mockResolvedValue(value);

      const result = await service.get(key);

      expect(result).toBe(value);
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
    });

    it('should return null for non-existing key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existing-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL of 60 seconds', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set(key, value);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: 60 },
      );
    });

    it('should set value with custom TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      const ttl = 300;
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set(key, value, ttl);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: ttl },
      );
    });

    it('should stringify complex objects', async () => {
      const key = 'complex-key';
      const value = { nested: { deep: { value: 123 } }, array: [1, 2, 3] };
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set(key, value);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: 60 },
      );
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del(key);

      expect(result).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('should return 0 when key does not exist', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await service.del('non-existing-key');

      expect(result).toBe(0);
    });
  });
});