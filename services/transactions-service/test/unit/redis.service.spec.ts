import { RedisService } from '../../src/redis/redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    service = new RedisService(mockClient);
  });

  describe('set', () => {
    it('should set value with default TTL of 60 seconds', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      mockClient.set.mockResolvedValue('OK');

      await service.set(key, value);

      expect(mockClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: 60 },
      );
    });

    it('should set value with custom TTL', async () => {
      const key = 'test-key';
      const value = { data: 'test' };
      mockClient.set.mockResolvedValue('OK');

      await service.set(key, value, 300);

      expect(mockClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: 300 },
      );
    });

    it('should stringify complex objects', async () => {
      const key = 'complex-key';
      const value = { nested: { deep: { value: 123 } }, array: [1, 2, 3] };
      mockClient.set.mockResolvedValue('OK');

      await service.set(key, value, 120);

      expect(mockClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(value),
        { EX: 120 },
      );
    });
  });

  describe('get', () => {
    it('should return parsed value for existing key', async () => {
      const storedValue = { id: '1', name: 'Test' };
      mockClient.get.mockResolvedValue(JSON.stringify(storedValue));

      const result = await service.get('test-key');

      expect(result).toEqual(storedValue);
      expect(mockClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existing key', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await service.get('non-existing-key');

      expect(result).toBeNull();
    });

    it('should parse complex JSON objects', async () => {
      const storedValue = {
        user: { id: '1', name: 'Test' },
        transactions: [{ id: 'tx-1', amount: 100 }],
      };
      mockClient.get.mockResolvedValue(JSON.stringify(storedValue));

      const result = await service.get('complex-key');

      expect(result).toEqual(storedValue);
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      mockClient.del.mockResolvedValue(1);

      await service.del('test-key');

      expect(mockClient.del).toHaveBeenCalledWith('test-key');
    });
  });
});
