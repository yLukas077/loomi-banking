import { Test } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../src/users/entities/user.entity';
import { BankingDetails } from '../../src/users/entities/banking-details.entity';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { userFactory } from '../factories/user.factory';
import { bankingFactory } from '../factories/banking.factory';

// Mocks
const mockUserRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

const mockBankingDetailsRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockRabbitMQPublisher = {
  publish: jest.fn(),
  onModuleInit: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  onModuleInit: jest.fn(),
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

  // ==================== CREATE ====================
  describe('create', () => {
    it('should create a user successfully', async () => {
      const dto = userFactory();
      const savedUser = { id: 'uuid-1', ...dto, createdAt: new Date(), updatedAt: new Date() };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockResolvedValue(savedUser);
      mockRabbitMQPublisher.publish.mockResolvedValue(undefined);

      const result = await service.create(dto);

      expect(result).toEqual(savedUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { email: dto.email } });
      expect(mockUserRepository.create).toHaveBeenCalledWith(dto);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'user.created',
        expect.objectContaining({
          event: 'user.created',
          userId: savedUser.id,
          email: savedUser.email,
        }),
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const dto = userFactory();
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-id', ...dto });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should return cached result when idempotency key has success status', async () => {
      const dto = userFactory();
      const cachedUser = { id: 'cached-id', ...dto };
      const idempotencyKey = 'idem-key-123';

      mockIdempotencyService.get.mockResolvedValue({ status: 'success', data: cachedUser });

      const result = await service.create(dto, idempotencyKey);

      expect(result).toEqual(cachedUser);
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should save idempotency key on new request', async () => {
      const dto = userFactory();
      const savedUser = { id: 'uuid-1', ...dto };
      const idempotencyKey = 'idem-key-456';

      mockIdempotencyService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockResolvedValue(savedUser);

      await service.create(dto, idempotencyKey);

      expect(mockIdempotencyService.save).toHaveBeenCalledWith(
        idempotencyKey,
        expect.objectContaining({ status: 'pending' }),
      );
      expect(mockIdempotencyService.save).toHaveBeenCalledWith(
        idempotencyKey,
        expect.objectContaining({ status: 'success', data: savedUser }),
      );
    });

    it('should process request when idempotency key has pending status', async () => {
      const dto = userFactory();
      const savedUser = { id: 'uuid-1', ...dto };
      const idempotencyKey = 'idem-key-789';

      mockIdempotencyService.get.mockResolvedValue({ status: 'pending', data: null });
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(dto, idempotencyKey);

      expect(result).toEqual(savedUser);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should create user without idempotency key', async () => {
      const dto = userFactory();
      const savedUser = { id: 'uuid-1', ...dto };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(dto, null);

      expect(result).toEqual(savedUser);
      expect(mockIdempotencyService.get).not.toHaveBeenCalled();
      expect(mockIdempotencyService.save).not.toHaveBeenCalled();
    });
  });

  // ==================== FIND BY ID ====================
  describe('findById', () => {
    it('should return cached user from Redis', async () => {
      const cachedUser = { id: 'uuid-1', name: 'Test', email: 'test@example.com' };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedUser));

      const result = await service.findById('uuid-1');

      expect(result).toEqual(cachedUser);
      expect(mockRedisService.get).toHaveBeenCalledWith('users:uuid-1');
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache when not in Redis', async () => {
      const user = { id: 'uuid-1', name: 'Test', email: 'test@example.com', bankingDetails: null };
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.findById('uuid-1');

      expect(result).toEqual(user);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        relations: ['bankingDetails'],
      });
      expect(mockRedisService.set).toHaveBeenCalledWith('users:uuid-1', user, 60);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return all users ordered by createdAt DESC', async () => {
      const users = [
        { id: 'uuid-1', name: 'User 1', email: 'user1@example.com' },
        { id: 'uuid-2', name: 'User 2', email: 'user2@example.com' },
      ];
      mockUserRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toEqual(users);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        relations: ['bankingDetails'],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no users exist', async () => {
      mockUserRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ==================== UPDATE ====================
  describe('update', () => {
    it('should update user successfully', async () => {
      const existingUser = { id: 'uuid-1', name: 'Old Name', email: 'old@example.com' };
      const updateDto = { name: 'New Name' };
      const updatedUser = { ...existingUser, ...updateDto };

      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.update('uuid-1', updateDto);

      expect(result).toEqual(updatedUser);
      expect(mockRedisService.del).toHaveBeenCalledWith('users:uuid-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const existingUser = { id: 'uuid-1', name: 'User 1', email: 'user1@example.com' };
      const anotherUser = { id: 'uuid-2', name: 'User 2', email: 'user2@example.com' };

      mockUserRepository.findOne
        .mockResolvedValueOnce(existingUser) // First call: find user to update
        .mockResolvedValueOnce(anotherUser); // Second call: check if email exists

      await expect(service.update('uuid-1', { email: 'user2@example.com' })).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same email', async () => {
      const existingUser = { id: 'uuid-1', name: 'User 1', email: 'user1@example.com' };

      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(existingUser);

      const result = await service.update('uuid-1', { email: 'user1@example.com' });

      expect(result).toEqual(existingUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should update multiple fields at once', async () => {
      const existingUser = { id: 'uuid-1', name: 'Old', email: 'old@example.com', address: 'Old Address' };
      const updateDto = { name: 'New', address: 'New Address' };
      const updatedUser = { ...existingUser, ...updateDto };

      mockUserRepository.findOne.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await service.update('uuid-1', updateDto);

      expect(result.name).toBe('New');
      expect(result.address).toBe('New Address');
    });
  });

  // ==================== DELETE ====================
  describe('delete', () => {
    it('should delete user successfully', async () => {
      const user = { id: 'uuid-1', name: 'Test', email: 'test@example.com' };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.delete('uuid-1');

      expect(result).toBe(true);
      expect(mockUserRepository.delete).toHaveBeenCalledWith('uuid-1');
      expect(mockRedisService.del).toHaveBeenCalledWith('users:uuid-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });
  });

  // ==================== SET BANKING DETAILS ====================
  describe('setBankingDetails', () => {
    it('should create new banking details for user without existing details', async () => {
      const user = { id: 'uuid-1', name: 'Test', email: 'test@example.com', bankingDetails: null };
      const bankingDto = bankingFactory();
      const savedDetails = { id: 'banking-1', ...bankingDto, userId: user.id };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.create.mockReturnValue({ ...bankingDto, user, userId: user.id });
      mockBankingDetailsRepository.save.mockResolvedValue(savedDetails);

      const result = await service.setBankingDetails('uuid-1', bankingDto);

      expect(result).toEqual(savedDetails);
      expect(mockBankingDetailsRepository.create).toHaveBeenCalledWith({
        ...bankingDto,
        user,
        userId: user.id,
      });
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'banking_details.updated',
        expect.objectContaining({
          event: 'banking_details.updated',
          userId: user.id,
        }),
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('users:uuid-1');
    });

    it('should update existing banking details', async () => {
      const existingDetails = { id: 'banking-1', agency: '001', accountNumber: '11111111', accountType: 'checking' };
      const user = { id: 'uuid-1', name: 'Test', email: 'test@example.com', bankingDetails: existingDetails };
      const bankingDto = { agency: '237', accountNumber: '99999999', accountType: 'savings' };
      const updatedDetails = { ...existingDetails, ...bankingDto };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.save.mockResolvedValue(updatedDetails);

      const result = await service.setBankingDetails('uuid-1', bankingDto);

      expect(result).toEqual(updatedDetails);
      expect(mockBankingDetailsRepository.create).not.toHaveBeenCalled();
      expect(mockBankingDetailsRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.setBankingDetails('non-existent', bankingFactory())).rejects.toThrow(NotFoundException);
    });

    it('should publish event with correct banking details', async () => {
      const user = { id: 'uuid-1', name: 'Test', email: 'test@example.com', bankingDetails: null };
      const bankingDto = { agency: '237', accountNumber: '12345678', accountType: 'checking' };
      const savedDetails = { id: 'banking-1', ...bankingDto, userId: user.id };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockBankingDetailsRepository.create.mockReturnValue({ ...bankingDto, user, userId: user.id });
      mockBankingDetailsRepository.save.mockResolvedValue(savedDetails);

      await service.setBankingDetails('uuid-1', bankingDto);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'banking_details.updated',
        expect.objectContaining({
          details: {
            agency: '237',
            accountNumber: '12345678',
            accountType: 'checking',
          },
        }),
      );
    });
  });
});