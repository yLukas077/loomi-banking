import { Test } from '@nestjs/testing';
import { TransactionsController } from '../../src/transactions/transactions.controller';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { TransactionStatus, TransactionType } from '../../src/transactions/entities/transaction.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: TransactionsService;

  const mockTransactionsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: mockTransactionsService },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get<TransactionsService>(TransactionsService);
  });

  // ==================== CREATE ====================
  describe('create', () => {
    const createDto = {
      userId: 'user-uuid-1',
      type: TransactionType.DEPOSIT,
      amount: 100.50,
      description: 'Test deposit',
    };

    it('should create a transaction with idempotency key', async () => {
      const expectedResult = { id: 'tx-uuid-1', ...createDto, status: TransactionStatus.PENDING };
      mockTransactionsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto, 'idem-key-123');

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(createDto, 'idem-key-123');
    });

    it('should create a transaction without idempotency key', async () => {
      const expectedResult = { id: 'tx-uuid-1', ...createDto, status: TransactionStatus.PENDING };
      mockTransactionsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(expectedResult);
      expect(service.create).toHaveBeenCalledWith(createDto, undefined);
    });

    it('should propagate BadRequestException from service', async () => {
      mockTransactionsService.create.mockRejectedValue(new BadRequestException('User does not exist'));

      await expect(controller.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return all transactions', async () => {
      const transactions = [
        { id: 'tx-1', userId: 'user-1', type: TransactionType.DEPOSIT, amount: 100, status: TransactionStatus.COMPLETED },
        { id: 'tx-2', userId: 'user-2', type: TransactionType.WITHDRAW, amount: 50, status: TransactionStatus.PENDING },
      ];
      mockTransactionsService.findAll.mockResolvedValue(transactions);

      const result = await controller.findAll();

      expect(result).toEqual(transactions);
      expect(result).toHaveLength(2);
      expect(service.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no transactions exist', async () => {
      mockTransactionsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ==================== FIND BY ID ====================
  describe('findById', () => {
    it('should return a transaction by id', async () => {
      const transaction = {
        id: 'tx-uuid-1',
        userId: 'user-uuid-1',
        type: TransactionType.DEPOSIT,
        amount: 100,
        status: TransactionStatus.PENDING,
      };
      mockTransactionsService.findById.mockResolvedValue(transaction);

      const result = await controller.findById('tx-uuid-1');

      expect(result).toEqual(transaction);
      expect(service.findById).toHaveBeenCalledWith('tx-uuid-1');
    });

    it('should propagate NotFoundException from service', async () => {
      mockTransactionsService.findById.mockRejectedValue(new NotFoundException('Transaction not found'));

      await expect(controller.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== UPDATE STATUS ====================
  describe('updateStatus', () => {
    it('should update transaction status to COMPLETED', async () => {
      const updatedTx = {
        id: 'tx-uuid-1',
        userId: 'user-uuid-1',
        type: TransactionType.DEPOSIT,
        amount: 100,
        status: TransactionStatus.COMPLETED,
      };
      mockTransactionsService.updateStatus.mockResolvedValue(updatedTx);

      const result = await controller.updateStatus('tx-uuid-1', { status: TransactionStatus.COMPLETED });

      expect(result).toEqual(updatedTx);
      expect(service.updateStatus).toHaveBeenCalledWith('tx-uuid-1', TransactionStatus.COMPLETED);
    });

    it('should update transaction status to FAILED', async () => {
      const updatedTx = {
        id: 'tx-uuid-1',
        status: TransactionStatus.FAILED,
      };
      mockTransactionsService.updateStatus.mockResolvedValue(updatedTx);

      const result = await controller.updateStatus('tx-uuid-1', { status: TransactionStatus.FAILED });

      expect(result.status).toBe(TransactionStatus.FAILED);
    });

    it('should propagate NotFoundException from service', async () => {
      mockTransactionsService.updateStatus.mockRejectedValue(new NotFoundException('Transaction not found'));

      await expect(controller.updateStatus('non-existent', { status: TransactionStatus.COMPLETED })).rejects.toThrow(NotFoundException);
    });
  });
});
