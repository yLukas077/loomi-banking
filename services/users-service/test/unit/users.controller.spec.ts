import { Test } from '@nestjs/testing';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setBankingDetails: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  // ==================== CREATE USER ====================
  describe('createUser', () => {
    it('should create a user with idempotency key', async () => {
      const dto = { name: 'Test User', email: 'test@example.com' };
      const idempotencyKey = 'unique-key-123';
      const expectedResult = { id: 'uuid-1', ...dto };

      mockUsersService.create.mockResolvedValue(expectedResult);

      const result = await controller.createUser(dto, idempotencyKey);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto, idempotencyKey);
    });

    it('should create a user with null when no idempotency key provided', async () => {
      const dto = { name: 'Test User', email: 'test@example.com' };
      const expectedResult = { id: 'uuid-1', ...dto };

      mockUsersService.create.mockResolvedValue(expectedResult);

      const result = await controller.createUser(dto, undefined as unknown as string);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(dto, null);
    });

    it('should propagate ConflictException from service', async () => {
      const dto = { name: 'Test User', email: 'existing@example.com' };

      mockUsersService.create.mockRejectedValue(new ConflictException('Email já está em uso'));

      await expect(controller.createUser(dto, 'key')).rejects.toThrow(ConflictException);
    });

    it('should create user with optional address', async () => {
      const dto = { name: 'Test User', email: 'test@example.com', address: 'Av. Brasil, 123' };
      const expectedResult = { id: 'uuid-1', ...dto };

      mockUsersService.create.mockResolvedValue(expectedResult);

      const result = await controller.createUser(dto, 'key');

      expect(result.address).toBe('Av. Brasil, 123');
    });
  });

  // ==================== GET USER ====================
  describe('getUser', () => {
    it('should return a user by id', async () => {
      const userId = 'uuid-1';
      const expectedResult = { id: userId, name: 'Test', email: 'test@example.com' };

      mockUsersService.findById.mockResolvedValue(expectedResult);

      const result = await controller.getUser(userId);

      expect(result).toEqual(expectedResult);
      expect(service.findById).toHaveBeenCalledWith(userId);
    });

    it('should return user with banking details', async () => {
      const userId = 'uuid-1';
      const expectedResult = {
        id: userId,
        name: 'Test',
        email: 'test@example.com',
        bankingDetails: {
          agency: '237',
          accountNumber: '12345678',
          accountType: 'checking',
        },
      };

      mockUsersService.findById.mockResolvedValue(expectedResult);

      const result = await controller.getUser(userId);

      expect(result.bankingDetails).toBeDefined();
      expect(result.bankingDetails.agency).toBe('237');
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.findById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.getUser('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== GET ALL USERS ====================
  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const expectedResult = [
        { id: 'uuid-1', name: 'User 1', email: 'user1@example.com' },
        { id: 'uuid-2', name: 'User 2', email: 'user2@example.com' },
      ];

      mockUsersService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.getAllUsers();

      expect(result).toEqual(expectedResult);
      expect(result).toHaveLength(2);
      expect(service.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no users exist', async () => {
      mockUsersService.findAll.mockResolvedValue([]);

      const result = await controller.getAllUsers();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  // ==================== UPDATE USER ====================
  describe('updateUser', () => {
    it('should update user name', async () => {
      const userId = 'uuid-1';
      const dto = { name: 'Updated Name' };
      const expectedResult = { id: userId, name: 'Updated Name', email: 'test@example.com' };

      mockUsersService.update.mockResolvedValue(expectedResult);

      const result = await controller.updateUser(userId, dto);

      expect(result).toEqual(expectedResult);
      expect(service.update).toHaveBeenCalledWith(userId, dto);
    });

    it('should update user email', async () => {
      const userId = 'uuid-1';
      const dto = { email: 'new@example.com' };
      const expectedResult = { id: userId, name: 'Test', email: 'new@example.com' };

      mockUsersService.update.mockResolvedValue(expectedResult);

      const result = await controller.updateUser(userId, dto);

      expect(result.email).toBe('new@example.com');
    });

    it('should update multiple fields', async () => {
      const userId = 'uuid-1';
      const dto = { name: 'New Name', email: 'new@example.com', address: 'New Address' };
      const expectedResult = { id: userId, ...dto };

      mockUsersService.update.mockResolvedValue(expectedResult);

      const result = await controller.updateUser(userId, dto);

      expect(result.name).toBe('New Name');
      expect(result.email).toBe('new@example.com');
      expect(result.address).toBe('New Address');
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.update.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.updateUser('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should propagate ConflictException when email already exists', async () => {
      mockUsersService.update.mockRejectedValue(new ConflictException('Email já está em uso'));

      await expect(controller.updateUser('uuid-1', { email: 'existing@example.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ==================== DELETE USER ====================
  describe('deleteUser', () => {
    it('should delete user and return success', async () => {
      const userId = 'uuid-1';
      mockUsersService.delete.mockResolvedValue(true);

      const result = await controller.deleteUser(userId);

      expect(result).toEqual({ deleted: true });
      expect(service.delete).toHaveBeenCalledWith(userId);
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.delete.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.deleteUser('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== SET BANKING DETAILS ====================
  describe('setBankingDetails', () => {
    it('should set banking details for user', async () => {
      const userId = 'uuid-1';
      const bankingDto = {
        agency: '237',
        accountNumber: '00099922',
        accountType: 'checking',
      };
      const expectedResult = { id: 'banking-1', userId, ...bankingDto };

      mockUsersService.setBankingDetails.mockResolvedValue(expectedResult);

      const result = await controller.setBankingDetails(userId, bankingDto);

      expect(result).toEqual(expectedResult);
      expect(service.setBankingDetails).toHaveBeenCalledWith(userId, bankingDto);
    });

    it('should update existing banking details', async () => {
      const userId = 'uuid-1';
      const bankingDto = {
        agency: '341',
        accountNumber: '11111111',
        accountType: 'savings',
      };
      const expectedResult = { id: 'banking-1', userId, ...bankingDto };

      mockUsersService.setBankingDetails.mockResolvedValue(expectedResult);

      const result = await controller.setBankingDetails(userId, bankingDto);

      expect(result.accountType).toBe('savings');
    });

    it('should propagate NotFoundException from service', async () => {
      const bankingDto = {
        agency: '237',
        accountNumber: '00099922',
        accountType: 'checking',
      };

      mockUsersService.setBankingDetails.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.setBankingDetails('non-existent', bankingDto)).rejects.toThrow(NotFoundException);
    });
  });
});