import { Test } from '@nestjs/testing';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { RedisService } from '../../src/redis/redis.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let redisService: RedisService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return parsed data when key exists', async () => {
      const key = 'test-key';
      const storedData = { status: 'success', data: { id: '1' } };
      mockRedisService.get.mockResolvedValue(JSON.stringify(storedData));

      const result = await service.get(key);

      expect(result).toEqual(storedData);
      expect(mockRedisService.get).toHaveBeenCalledWith(`idemp:users:${key}`);
    });

    it('should return null when key does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null when redis returns empty string', async () => {
      mockRedisService.get.mockResolvedValue('');

      const result = await service.get('empty-key');

      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('should save data with 10 minute TTL', async () => {
      const key = 'test-key';
      const value = { status: 'pending', data: null };
      mockRedisService.set.mockResolvedValue('OK');

      await service.save(key, value);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `idemp:users:${key}`,
        value,
        600, // 10 minutes
      );
    });

    it('should save complex data structures', async () => {
      const key = 'complex-key';
      const value = {
        status: 'success',
        data: { id: '1', name: 'Test', nested: { value: 123 } },
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockRedisService.set.mockResolvedValue('OK');

      await service.save(key, value);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `idemp:users:${key}`,
        value,
        600,
      );
    });
  });
});