import { Test } from '@nestjs/testing';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    getBalance: jest.fn(),
    update: jest.fn(),
    setBankingDetails: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  // ==================== GET BALANCE ====================
  describe('getBalance', () => {
    it('should return user balance', async () => {
      const balanceResponse = {
        userId: 'user-uuid-1',
        balance: 500.50,
        updatedAt: new Date(),
      };
      mockUsersService.getBalance.mockResolvedValue(balanceResponse);

      const result = await controller.getBalance('user-uuid-1');

      expect(result).toEqual(balanceResponse);
      expect(service.getBalance).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return zero balance', async () => {
      const balanceResponse = {
        userId: 'user-uuid-1',
        balance: 0,
        updatedAt: new Date(),
      };
      mockUsersService.getBalance.mockResolvedValue(balanceResponse);

      const result = await controller.getBalance('user-uuid-1');

      expect(result.balance).toBe(0);
    });

    it('should return negative balance', async () => {
      const balanceResponse = {
        userId: 'user-uuid-1',
        balance: -100.50,
        updatedAt: new Date(),
      };
      mockUsersService.getBalance.mockResolvedValue(balanceResponse);

      const result = await controller.getBalance('user-uuid-1');

      expect(result.balance).toBe(-100.50);
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.getBalance.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.getBalance('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== CREATE ====================
  describe('createUser', () => {
    it('should create a user with zero balance', async () => {
      const createDto = { name: 'Test User', email: 'test@example.com' };
      const createdUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockUsersService.create.mockResolvedValue(createdUser);

      const result = await controller.createUser(createDto);

      expect(result).toEqual(createdUser);
      expect(result.balance).toBe(0);
      expect(service.create).toHaveBeenCalledWith(createDto, undefined);
    });

    it('should create a user with idempotency key', async () => {
      const createDto = { name: 'Test User', email: 'test@example.com' };
      const createdUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockUsersService.create.mockResolvedValue(createdUser);

      const result = await controller.createUser(createDto, 'idem-key-123');

      expect(result).toEqual(createdUser);
      expect(service.create).toHaveBeenCalledWith(createDto, 'idem-key-123');
    });

    it('should create a user with address', async () => {
      const createDto = { name: 'Test User', email: 'test@example.com', address: 'Rua ABC, 123' };
      const createdUser = { id: 'user-uuid-1', ...createDto, balance: 0 };
      mockUsersService.create.mockResolvedValue(createdUser);

      const result = await controller.createUser(createDto);

      expect(result.address).toBe('Rua ABC, 123');
    });

    it('should propagate ConflictException from service', async () => {
      const createDto = { name: 'Test User', email: 'existing@example.com' };
      mockUsersService.create.mockRejectedValue(new ConflictException('Email already exists'));

      await expect(controller.createUser(createDto)).rejects.toThrow(ConflictException);
    });
  });

  // ==================== GET ALL ====================
  describe('getAllUsers', () => {
    it('should return all users with balance', async () => {
      const users = [
        { id: 'user-1', name: 'User 1', balance: 100 },
        { id: 'user-2', name: 'User 2', balance: 200 },
      ];
      mockUsersService.findAll.mockResolvedValue(users);

      const result = await controller.getAllUsers();

      expect(result).toEqual(users);
      expect(result).toHaveLength(2);
    });

    it('should return empty array', async () => {
      mockUsersService.findAll.mockResolvedValue([]);

      const result = await controller.getAllUsers();

      expect(result).toEqual([]);
    });
  });

  // ==================== GET BY ID ====================
  describe('getUser', () => {
    it('should return a user by id with balance', async () => {
      const user = { id: 'user-uuid-1', name: 'Test User', balance: 100 };
      mockUsersService.findById.mockResolvedValue(user);

      const result = await controller.getUser('user-uuid-1');

      expect(result).toEqual(user);
      expect(service.findById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should return user with banking details', async () => {
      const user = {
        id: 'user-uuid-1',
        name: 'Test User',
        balance: 100,
        bankingDetails: { agency: '237', accountNumber: '12345678' },
      };
      mockUsersService.findById.mockResolvedValue(user);

      const result = await controller.getUser('user-uuid-1');

      expect((result as any).bankingDetails).toBeDefined();
    });

    it('should propagate NotFoundException', async () => {
      mockUsersService.findById.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.getUser('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== UPDATE ====================
  describe('updateUser', () => {
    it('should update a user', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { id: 'user-uuid-1', name: 'Updated Name', balance: 100 };
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.updateUser('user-uuid-1', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(service.update).toHaveBeenCalledWith('user-uuid-1', updateDto);
    });

    it('should update user email', async () => {
      const updateDto = { email: 'new@example.com' };
      const updatedUser = { id: 'user-uuid-1', email: 'new@example.com', balance: 100 };
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.updateUser('user-uuid-1', updateDto);

      expect(result.email).toBe('new@example.com');
    });

    it('should propagate NotFoundException', async () => {
      mockUsersService.update.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.updateUser('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should propagate ConflictException for duplicate email', async () => {
      mockUsersService.update.mockRejectedValue(new ConflictException('Email already exists'));

      await expect(controller.updateUser('user-1', { email: 'taken@example.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ==================== SET BANKING DETAILS ====================
  describe('setBankingDetails', () => {
    it('should set banking details', async () => {
      const bankingDto = { agency: '237', accountNumber: '12345678', accountType: 'checking' as const };
      const savedDetails = { id: 'bd-1', ...bankingDto };
      mockUsersService.setBankingDetails.mockResolvedValue(savedDetails);

      const result = await controller.setBankingDetails('user-uuid-1', bankingDto);

      expect(result).toEqual(savedDetails);
      expect(service.setBankingDetails).toHaveBeenCalledWith('user-uuid-1', bankingDto);
    });

    it('should update existing banking details', async () => {
      const bankingDto = { agency: '341', accountNumber: '87654321', accountType: 'savings' as const };
      const savedDetails = { id: 'bd-1', ...bankingDto };
      mockUsersService.setBankingDetails.mockResolvedValue(savedDetails);

      const result = await controller.setBankingDetails('user-uuid-1', bankingDto);

      expect(result.agency).toBe('341');
      expect(result.accountType).toBe('savings');
    });

    it('should propagate NotFoundException', async () => {
      const bankingDto = { agency: '237', accountNumber: '12345678', accountType: 'checking' as const };
      mockUsersService.setBankingDetails.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.setBankingDetails('non-existent', bankingDto)).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== DELETE ====================
  describe('deleteUser', () => {
    it('should delete a user', async () => {
      mockUsersService.delete.mockResolvedValue({ deleted: true });

      const result = await controller.deleteUser('user-uuid-1');

      expect(result).toEqual({ deleted: true });
      expect(service.delete).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should propagate NotFoundException', async () => {
      mockUsersService.delete.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.deleteUser('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});