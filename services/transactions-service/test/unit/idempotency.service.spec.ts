import { Test } from '@nestjs/testing';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { RedisService } from '../../src/redis/redis.service';
import { BadRequestException } from '@nestjs/common';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

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
  });

  describe('checkOrSave', () => {
    it('should return null when key does not exist and save initial entry', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.checkOrSave('key-123', 'hash-abc');

      expect(result).toBeNull();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'idem:key-123',
        { payloadHash: 'hash-abc' },
        300, // 5 minutes
      );
    });

    it('should return cached response when key exists with matching hash', async () => {
      const cachedData = {
        payloadHash: 'hash-abc',
        response: { id: 'tx-1', amount: 100 },
      };
      mockRedisService.get.mockResolvedValue(cachedData);

      const result = await service.checkOrSave('key-123', 'hash-abc');

      expect(result).toEqual(cachedData.response);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when key exists with different hash', async () => {
      const cachedData = {
        payloadHash: 'hash-abc',
        response: { id: 'tx-1' },
      };
      mockRedisService.get.mockResolvedValue(cachedData);

      await expect(service.checkOrSave('key-123', 'different-hash')).rejects.toThrow(BadRequestException);
      await expect(service.checkOrSave('key-123', 'different-hash')).rejects.toThrow(
        'Idempotency-Key reused with different payload',
      );
    });

    it('should return null when cached entry has no response yet (pending)', async () => {
      const cachedData = {
        payloadHash: 'hash-abc',
        // no response - request is still pending
      };
      mockRedisService.get.mockResolvedValue(cachedData);

      const result = await service.checkOrSave('key-123', 'hash-abc');

      expect(result).toBeUndefined();
    });
  });

  describe('saveResponse', () => {
    it('should save response with hash', async () => {
      const response = { id: 'tx-1', amount: 100, status: 'pending' };

      await service.saveResponse('key-123', response, 'hash-abc');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'idem:key-123',
        { payloadHash: 'hash-abc', response },
        300,
      );
    });

    it('should save complex response object', async () => {
      const response = {
        id: 'tx-1',
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
      };

      await service.saveResponse('key-456', response, 'hash-xyz');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'idem:key-456',
        { payloadHash: 'hash-xyz', response },
        300,
      );
    });
  });
});
