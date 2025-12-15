import { Test } from '@nestjs/testing';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../../src/transactions/entities/transaction.entity';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockTransactionRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
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
  checkOrSave: jest.fn(),
  saveResponse: jest.fn(),
};

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: mockTransactionRepository },
        { provide: RabbitMQPublisher, useValue: mockRabbitMQPublisher },
        { provide: RedisService, useValue: mockRedisService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

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

    it('should create a deposit transaction successfully', async () => {
      const savedTransaction = {
        id: 'tx-uuid-1',
        ...createDto,
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.get.mockResolvedValue({ id: 'user-uuid-1', name: 'Test User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      const result = await service.create(createDto);

      expect(result).toEqual(savedTransaction);
      expect(mockTransactionRepository.create).toHaveBeenCalledWith({
        ...createDto,
        status: TransactionStatus.PENDING,
      });
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          event: 'transaction.created',
          transactionId: savedTransaction.id,
          userId: createDto.userId,
        }),
      );
    });

    it('should throw BadRequestException when user does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(createDto)).rejects.toThrow('User does not exist');
    });

    it('should create withdraw transaction when user has banking details', async () => {
      const withdrawDto = {
        userId: 'user-uuid-1',
        type: TransactionType.WITHDRAW,
        amount: 50,
      };
      const savedTransaction = { id: 'tx-uuid-1', ...withdrawDto, status: TransactionStatus.PENDING };

      mockRedisService.get
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' }) // user
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' }); // banking

      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      const result = await service.create(withdrawDto);

      expect(result).toEqual(savedTransaction);
    });

    it('should throw BadRequestException for withdraw without banking details', async () => {
      const withdrawDto = {
        userId: 'user-uuid-1',
        type: TransactionType.WITHDRAW,
        amount: 50,
      };

      // First call returns user, second call returns null (no banking)
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' }) // user exists
        .mockResolvedValueOnce(null) // no banking details
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' }) // user exists (second expect)
        .mockResolvedValueOnce(null); // no banking details (second expect)

      await expect(service.create(withdrawDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(withdrawDto)).rejects.toThrow('User has no banking details configured');
    });

    it('should throw BadRequestException for withdraw with incomplete banking details', async () => {
      const withdrawDto = {
        userId: 'user-uuid-1',
        type: TransactionType.WITHDRAW,
        amount: 50,
      };

      // Mock for both expect calls
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: null, accountType: 'checking' }) // incomplete
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: null, accountType: 'checking' }); // incomplete

      await expect(service.create(withdrawDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(withdrawDto)).rejects.toThrow('User banking details are incomplete');
    });

    it('should throw BadRequestException for transfer without banking details', async () => {
      const transferDto = {
        userId: 'user-uuid-1',
        type: TransactionType.TRANSFER,
        amount: 100,
      };

      mockRedisService.get
        .mockResolvedValueOnce({ id: 'user-uuid-1', name: 'Test User' })
        .mockResolvedValueOnce(null);

      await expect(service.create(transferDto)).rejects.toThrow(BadRequestException);
    });

    it('should return cached response when idempotency key exists', async () => {
      const cachedTransaction = { id: 'cached-tx', ...createDto, status: TransactionStatus.PENDING };
      mockIdempotencyService.checkOrSave.mockResolvedValue(cachedTransaction);

      const result = await service.create(createDto, 'idem-key-123');

      expect(result).toEqual(cachedTransaction);
      expect(mockTransactionRepository.save).not.toHaveBeenCalled();
    });

    it('should save idempotency response on new request with key', async () => {
      const savedTransaction = { id: 'tx-uuid-1', ...createDto, status: TransactionStatus.PENDING };

      mockIdempotencyService.checkOrSave.mockResolvedValue(null);
      mockRedisService.get.mockResolvedValue({ id: 'user-uuid-1', name: 'Test User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      await service.create(createDto, 'idem-key-456');

      expect(mockIdempotencyService.saveResponse).toHaveBeenCalledWith(
        'idem-key-456',
        savedTransaction,
        expect.any(String),
      );
    });

    it('should not use idempotency when key is not provided', async () => {
      const savedTransaction = { id: 'tx-uuid-1', ...createDto, status: TransactionStatus.PENDING };

      mockRedisService.get.mockResolvedValue({ id: 'user-uuid-1', name: 'Test User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      await service.create(createDto);

      expect(mockIdempotencyService.checkOrSave).not.toHaveBeenCalled();
      expect(mockIdempotencyService.saveResponse).not.toHaveBeenCalled();
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return all transactions ordered by createdAt DESC', async () => {
      const transactions = [
        { id: 'tx-1', userId: 'user-1', type: TransactionType.DEPOSIT, amount: 100, status: TransactionStatus.COMPLETED },
        { id: 'tx-2', userId: 'user-2', type: TransactionType.WITHDRAW, amount: 50, status: TransactionStatus.PENDING },
      ];
      mockTransactionRepository.find.mockResolvedValue(transactions);

      const result = await service.findAll();

      expect(result).toEqual(transactions);
      expect(mockTransactionRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when no transactions exist', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

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
      mockTransactionRepository.findOne.mockResolvedValue(transaction);

      const result = await service.findById('tx-uuid-1');

      expect(result).toEqual(transaction);
      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({ where: { id: 'tx-uuid-1' } });
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('non-existent')).rejects.toThrow('Transaction not found');
    });
  });

  // ==================== UPDATE STATUS ====================
  describe('updateStatus', () => {
    it('should update transaction status to COMPLETED', async () => {
      const existingTx = {
        id: 'tx-uuid-1',
        userId: 'user-uuid-1',
        type: TransactionType.DEPOSIT,
        amount: 100,
        status: TransactionStatus.PENDING,
      };
      const updatedTx = { ...existingTx, status: TransactionStatus.COMPLETED };

      mockTransactionRepository.findOne.mockResolvedValue({ ...existingTx });
      mockTransactionRepository.save.mockResolvedValue(updatedTx);

      const result = await service.updateStatus('tx-uuid-1', TransactionStatus.COMPLETED);

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.status_updated',
        expect.objectContaining({
          event: 'transaction.status_updated',
          transactionId: 'tx-uuid-1',
          newStatus: TransactionStatus.COMPLETED,
        }),
      );
    });

    it('should update transaction status to FAILED', async () => {
      const existingTx = {
        id: 'tx-uuid-1',
        userId: 'user-uuid-1',
        status: TransactionStatus.PENDING,
      };
      const updatedTx = { ...existingTx, status: TransactionStatus.FAILED };

      mockTransactionRepository.findOne.mockResolvedValue({ ...existingTx });
      mockTransactionRepository.save.mockResolvedValue(updatedTx);

      const result = await service.updateStatus('tx-uuid-1', TransactionStatus.FAILED);

      expect(result.status).toBe(TransactionStatus.FAILED);
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(service.updateStatus('non-existent', TransactionStatus.COMPLETED)).rejects.toThrow(NotFoundException);
    });
  });
});