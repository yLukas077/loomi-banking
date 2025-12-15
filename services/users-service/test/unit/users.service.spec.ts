import { Test } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../src/users/entities/user.entity';
import { BankingDetails } from '../../src/users/entities/banking-details.entity';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

const mockUserRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

const mockBankingDetailsRepository = {
  create: jest.fn(),
  save: jest.fn(),
};

const mockRabbitMQPublisher = {
  publish: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockIdempotencyService = {
  get: jest.fn(),
  save: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(BankingDetails), useValue: mockBankingDetailsRepository },
        { provide: RabbitMQPublisher, useValue: mockRabbitMQPublisher },
        { provide: RedisService, useValue: mockRedisService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ==================== GET BALANCE ====================
  describe('getBalance', () => {
    it('should return user balance', async () => {
      const user = {
        id: 'user-uuid-1',
        name: 'Test User',
        balance: 500.50,
        updatedAt: new Date(),
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.getBalance('user-uuid-1');

      expect(result).toEqual({
        userId: 'user-uuid-1',
        balance: 500.50,
        updatedAt: user.updatedAt,
      });
    });

    it('should return zero balance for new user', async () => {
      const user = {
        id: 'user-uuid-1',
        name: 'New User',
        balance: 0,
        updatedAt: new Date(),
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.getBalance('user-uuid-1');

      expect(result.balance).toBe(0);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getBalance('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should convert string balance to number', async () => {
      const user = {
        id: 'user-uuid-1',
        balance: '123.45',
        updatedAt: new Date(),
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.getBalance('user-uuid-1');

      expect(result.balance).toBe(123.45);
      expect(typeof result.balance).toBe('number');
    });

    it('should handle negative balance', async () => {
      const user = {
        id: 'user-uuid-1',
        balance: -50.00,
        updatedAt: new Date(),
      };
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.getBalance('user-uuid-1');

      expect(result.balance).toBe(-50.00);
    });
  });

  // ==================== CREATE ====================
  describe('create', () => {
    const createDto = { name: 'Test User', email: 'test@example.com' };

    it('should create a user with zero balance', async () => {
      const savedUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(createDto);

      expect(result.balance).toBe(0);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        ...createDto,
        balance: 0,
      });
    });

    it('should throw ConflictException when email exists', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing', email: createDto.email });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should publish user.created event', async () => {
      const savedUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      await service.create(createDto);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'user.created',
        expect.objectContaining({
          event: 'user.created',
          userId: savedUser.id,
        }),
      );
    });

    it('should return cached response for idempotent request', async () => {
      const cachedUser = { id: 'cached-user', ...createDto, balance: 0 };
      mockIdempotencyService.get.mockResolvedValue({ status: 'success', data: cachedUser });

      const result = await service.create(createDto, 'idem-key-123');

      expect(result).toEqual(cachedUser);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should return pending status for in-progress idempotent request', async () => {
      mockIdempotencyService.get.mockResolvedValue({ status: 'pending', data: null });

      const result = await service.create(createDto, 'idem-key-123');

      expect(result).toEqual({ status: 'pending', data: null });
    });

    it('should save idempotency response on new request', async () => {
      const savedUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockIdempotencyService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedUser);
      mockUserRepository.save.mockResolvedValue(savedUser);

      await service.create(createDto, 'idem-key-456');

      expect(mockIdempotencyService.save).toHaveBeenCalledWith(
        'idem-key-456',
        { status: 'success', data: savedUser },
      );
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return all users with balance', async () => {
      const users = [
        { id: 'user-1', name: 'User 1', balance: 100 },
        { id: 'user-2', name: 'User 2', balance: 200 },
      ];
      mockUserRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        relations: ['bankingDetails'],
      });
    });

    it('should return empty array when no users exist', async () => {
      mockUserRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ==================== FIND BY ID ====================
  describe('findById', () => {
    it('should return cached user', async () => {
      const cachedUser = { id: 'user-1', name: 'Cached User', balance: 100 };
      mockRedisService.get.mockResolvedValue(cachedUser);

      const result = await service.findById('user-1');

      expect(result).toEqual(cachedUser);
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache when not in Redis', async () => {
      const user = { id: 'user-1', name: 'DB User', balance: 100 };
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.findById('user-1');

      expect(result).toEqual(user);
      expect(mockRedisService.set).toHaveBeenCalledWith('user:user-1', user, 300);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== UPDATE ====================
  describe('update', () => {
    it('should update user and clear cache', async () => {
      const user = { id: 'user-1', name: 'Old Name', email: 'old@example.com' };
      const updatedUser = { ...user, name: 'New Name' };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const user = { id: 'user-1', email: 'old@example.com' };
      mockUserRepository.findOne
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce({ id: 'user-2', email: 'taken@example.com' });

      await expect(service.update('user-1', { email: 'taken@example.com' })).rejects.toThrow(ConflictException);
    });

    it('should allow updating to same email', async () => {
      const user = { id: 'user-1', name: 'Test', email: 'same@example.com' };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue({ ...user, name: 'Updated' });

      const result = await service.update('user-1', { email: 'same@example.com', name: 'Updated' });

      expect(result.name).toBe('Updated');
    });
  });

  // ==================== SET BANKING DETAILS ====================
  describe('setBankingDetails', () => {
    const bankingDto = { agency: '237', accountNumber: '12345678', accountType: 'checking' as const };

    it('should create banking details for user without existing details', async () => {
      const user = { id: 'user-1', name: 'Test', bankingDetails: null };
      const savedDetails = { id: 'bd-1', ...bankingDto, user };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.create.mockReturnValue(savedDetails);
      mockBankingDetailsRepository.save.mockResolvedValue(savedDetails);

      const result = await service.setBankingDetails('user-1', bankingDto);

      expect(result).toEqual(savedDetails);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'banking_details.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('should update existing banking details', async () => {
      const existingDetails = { id: 'bd-1', agency: '001', accountNumber: '11111111', accountType: 'savings' };
      const user = { id: 'user-1', name: 'Test', bankingDetails: existingDetails };
      const updatedDetails = { ...existingDetails, ...bankingDto };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.save.mockResolvedValue(updatedDetails);

      const result = await service.setBankingDetails('user-1', bankingDto);

      expect(result.agency).toBe(bankingDto.agency);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.setBankingDetails('non-existent', bankingDto)).rejects.toThrow(NotFoundException);
    });

    it('should clear both user and banking cache', async () => {
      const user = { id: 'user-1', name: 'Test', bankingDetails: null };
      const savedDetails = { id: 'bd-1', ...bankingDto, user };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.create.mockReturnValue(savedDetails);
      mockBankingDetailsRepository.save.mockResolvedValue(savedDetails);

      await service.setBankingDetails('user-1', bankingDto);

      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-1');
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-1:banking');
    });
  });

  // ==================== DELETE ====================
  describe('delete', () => {
    it('should delete user and clear cache', async () => {
      const user = { id: 'user-1', name: 'To Delete' };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.delete('user-1');

      expect(result).toEqual({ deleted: true });
      expect(mockRedisService.del).toHaveBeenCalledWith('user:user-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});