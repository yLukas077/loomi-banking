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

  // ==================== CREATE - DEPOSIT ====================
  describe('create - deposit', () => {
    const depositDto = {
      receiverUserId: 'receiver-uuid-1',
      type: TransactionType.DEPOSIT,
      amount: 100.50,
      description: 'Test deposit',
    };

    it('should create a deposit transaction successfully', async () => {
      const savedTransaction = {
        id: 'tx-uuid-1',
        ...depositDto,
        senderUserId: null,
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRedisService.get.mockResolvedValue({ id: 'receiver-uuid-1', name: 'Receiver User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      const result = await service.create(depositDto);

      expect(result).toEqual(savedTransaction);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          event: 'transaction.created',
          receiverUserId: depositDto.receiverUserId,
          type: TransactionType.DEPOSIT,
          amount: expect.any(Number),
        }),
      );
    });

    it('should throw BadRequestException when receiver does not exist for deposit', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.create(depositDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(depositDto)).rejects.toThrow('Receiver user does not exist');
    });

    it('should throw BadRequestException when receiverUserId is missing for deposit', async () => {
      const invalidDto = {
        type: TransactionType.DEPOSIT,
        amount: 100,
      };

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== CREATE - WITHDRAW ====================
  describe('create - withdraw', () => {
    const withdrawDto = {
      senderUserId: 'sender-uuid-1',
      type: TransactionType.WITHDRAW,
      amount: 50,
    };

    it('should create a withdraw transaction successfully', async () => {
      const savedTransaction = {
        id: 'tx-uuid-1',
        ...withdrawDto,
        receiverUserId: null,
        status: TransactionStatus.PENDING,
      };

      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' });

      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      const result = await service.create(withdrawDto);

      expect(result).toEqual(savedTransaction);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          event: 'transaction.created',
          senderUserId: withdrawDto.senderUserId,
          type: TransactionType.WITHDRAW,
        }),
      );
    });

    it('should throw BadRequestException when sender does not exist for withdraw', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.create(withdrawDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(withdrawDto)).rejects.toThrow('Sender user does not exist');
    });

    it('should throw BadRequestException when sender has no banking details for withdraw', async () => {
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce(null);

      await expect(service.create(withdrawDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(withdrawDto)).rejects.toThrow('Sender has no banking details configured');
    });

    it('should throw BadRequestException when sender banking details are incomplete', async () => {
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: null, accountType: 'checking' })
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: null, accountType: 'checking' });

      await expect(service.create(withdrawDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(withdrawDto)).rejects.toThrow('Sender banking details are incomplete');
    });

    it('should throw BadRequestException when senderUserId is missing for withdraw', async () => {
      const invalidDto = {
        type: TransactionType.WITHDRAW,
        amount: 50,
      };

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== CREATE - TRANSFER ====================
  describe('create - transfer', () => {
    const transferDto = {
      senderUserId: 'sender-uuid-1',
      receiverUserId: 'receiver-uuid-1',
      type: TransactionType.TRANSFER,
      amount: 200,
      description: 'Transfer between accounts',
    };

    it('should create a transfer transaction successfully', async () => {
      const savedTransaction = {
        id: 'tx-uuid-1',
        ...transferDto,
        status: TransactionStatus.PENDING,
      };

      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' })
        .mockResolvedValueOnce({ id: 'receiver-uuid-1', name: 'Receiver User' })
        .mockResolvedValueOnce({ agency: '341', accountNumber: '87654321', accountType: 'savings' });

      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      const result = await service.create(transferDto);

      expect(result).toEqual(savedTransaction);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          senderUserId: transferDto.senderUserId,
          receiverUserId: transferDto.receiverUserId,
          type: TransactionType.TRANSFER,
        }),
      );
    });

    it('should throw BadRequestException when sender and receiver are the same', async () => {
      const sameAccountDto = {
        senderUserId: 'same-uuid',
        receiverUserId: 'same-uuid',
        type: TransactionType.TRANSFER,
        amount: 100,
      };

      await expect(service.create(sameAccountDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(sameAccountDto)).rejects.toThrow('Cannot transfer to the same account');
    });

    it('should throw BadRequestException when sender does not exist for transfer', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.create(transferDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(transferDto)).rejects.toThrow('Sender user does not exist');
    });

    it('should throw BadRequestException when sender has no banking details for transfer', async () => {
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce(null);

      await expect(service.create(transferDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(transferDto)).rejects.toThrow('Sender has no banking details configured');
    });

    it('should throw BadRequestException when receiver does not exist for transfer', async () => {
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' })
        .mockResolvedValueOnce(null);

      await expect(service.create(transferDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(transferDto)).rejects.toThrow('Receiver user does not exist');
    });

    it('should throw BadRequestException when receiver has no banking details for transfer', async () => {
      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' })
        .mockResolvedValueOnce({ id: 'receiver-uuid-1', name: 'Receiver User' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' })
        .mockResolvedValueOnce({ id: 'receiver-uuid-1', name: 'Receiver User' })
        .mockResolvedValueOnce(null);

      await expect(service.create(transferDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(transferDto)).rejects.toThrow('Receiver has no banking details configured');
    });

    it('should throw BadRequestException when senderUserId is missing for transfer', async () => {
      const invalidDto = {
        receiverUserId: 'receiver-uuid-1',
        type: TransactionType.TRANSFER,
        amount: 100,
      };

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when receiverUserId is missing for transfer', async () => {
      const invalidDto = {
        senderUserId: 'sender-uuid-1',
        type: TransactionType.TRANSFER,
        amount: 100,
      };

      mockRedisService.get
        .mockResolvedValueOnce({ id: 'sender-uuid-1', name: 'Sender User' })
        .mockResolvedValueOnce({ agency: '237', accountNumber: '12345678', accountType: 'checking' });

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== IDEMPOTENCY ====================
  describe('idempotency', () => {
    const depositDto = {
      receiverUserId: 'receiver-uuid-1',
      type: TransactionType.DEPOSIT,
      amount: 100,
    };

    it('should return cached response when idempotency key exists', async () => {
      const cachedTransaction = { id: 'cached-tx', ...depositDto, status: TransactionStatus.PENDING };
      mockIdempotencyService.checkOrSave.mockResolvedValue(cachedTransaction);

      const result = await service.create(depositDto, 'idem-key-123');

      expect(result).toEqual(cachedTransaction);
      expect(mockTransactionRepository.save).not.toHaveBeenCalled();
    });

    it('should save idempotency response on new request with key', async () => {
      const savedTransaction = { id: 'tx-uuid-1', ...depositDto, status: TransactionStatus.PENDING };

      mockIdempotencyService.checkOrSave.mockResolvedValue(null);
      mockRedisService.get.mockResolvedValue({ id: 'receiver-uuid-1', name: 'Receiver User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      await service.create(depositDto, 'idem-key-456');

      expect(mockIdempotencyService.saveResponse).toHaveBeenCalledWith(
        'idem-key-456',
        savedTransaction,
        expect.any(String),
      );
    });

    it('should not use idempotency when key is not provided', async () => {
      const savedTransaction = { id: 'tx-uuid-1', ...depositDto, status: TransactionStatus.PENDING };

      mockRedisService.get.mockResolvedValue({ id: 'receiver-uuid-1', name: 'Receiver User' });
      mockTransactionRepository.create.mockReturnValue(savedTransaction);
      mockTransactionRepository.save.mockResolvedValue(savedTransaction);

      await service.create(depositDto);

      expect(mockIdempotencyService.checkOrSave).not.toHaveBeenCalled();
    });
  });

  // ==================== FIND ALL ====================
  describe('findAll', () => {
    it('should return all transactions ordered by createdAt DESC', async () => {
      const transactions = [
        { id: 'tx-1', senderUserId: 'user-1', type: TransactionType.WITHDRAW, amount: 100 },
        { id: 'tx-2', receiverUserId: 'user-2', type: TransactionType.DEPOSIT, amount: 50 },
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
        senderUserId: 'sender-uuid-1',
        receiverUserId: 'receiver-uuid-1',
        type: TransactionType.TRANSFER,
        amount: 100,
        status: TransactionStatus.PENDING,
      };
      mockTransactionRepository.findOne.mockResolvedValue(transaction);

      const result = await service.findById('tx-uuid-1');

      expect(result).toEqual(transaction);
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== FIND BY USER ====================
  describe('findByUser', () => {
    it('should return transactions where user is sender or receiver', async () => {
      const transactions = [
        { id: 'tx-1', senderUserId: 'user-1', receiverUserId: 'user-2', type: TransactionType.TRANSFER },
        { id: 'tx-2', senderUserId: 'user-3', receiverUserId: 'user-1', type: TransactionType.TRANSFER },
      ];
      mockTransactionRepository.find.mockResolvedValue(transactions);

      const result = await service.findByUser('user-1');

      expect(result).toEqual(transactions);
      expect(mockTransactionRepository.find).toHaveBeenCalledWith({
        where: [
          { senderUserId: 'user-1' },
          { receiverUserId: 'user-1' },
        ],
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when user has no transactions', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);

      const result = await service.findByUser('user-with-no-tx');

      expect(result).toEqual([]);
    });
  });

  // ==================== UPDATE STATUS ====================
  describe('updateStatus', () => {
    it('should update transaction status to COMPLETED and publish event with type and amount', async () => {
      const existingTx = {
        id: 'tx-uuid-1',
        senderUserId: 'sender-uuid-1',
        receiverUserId: 'receiver-uuid-1',
        type: TransactionType.TRANSFER,
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
          senderUserId: 'sender-uuid-1',
          receiverUserId: 'receiver-uuid-1',
          type: TransactionType.TRANSFER,
          amount: 100,
          newStatus: TransactionStatus.COMPLETED,
        }),
      );
    });

    it('should update transaction status to FAILED', async () => {
      const existingTx = {
        id: 'tx-uuid-1',
        senderUserId: 'sender-uuid-1',
        receiverUserId: null,
        type: TransactionType.WITHDRAW,
        amount: 50,
        status: TransactionStatus.PENDING,
      };
      const updatedTx = { ...existingTx, status: TransactionStatus.FAILED };

      mockTransactionRepository.findOne.mockResolvedValue({ ...existingTx });
      mockTransactionRepository.save.mockResolvedValue(updatedTx);

      const result = await service.updateStatus('tx-uuid-1', TransactionStatus.FAILED);

      expect(result.status).toBe(TransactionStatus.FAILED);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.status_updated',
        expect.objectContaining({
          type: TransactionType.WITHDRAW,
          amount: 50,
          newStatus: TransactionStatus.FAILED,
        }),
      );
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(service.updateStatus('non-existent', TransactionStatus.COMPLETED)).rejects.toThrow(NotFoundException);
    });

    it('should convert decimal amount to number in event', async () => {
      const existingTx = {
        id: 'tx-uuid-1',
        receiverUserId: 'receiver-uuid-1',
        type: TransactionType.DEPOSIT,
        amount: '150.50', // PostgreSQL returns decimal as string
        status: TransactionStatus.PENDING,
      };
      const updatedTx = { ...existingTx, status: TransactionStatus.COMPLETED };

      mockTransactionRepository.findOne.mockResolvedValue({ ...existingTx });
      mockTransactionRepository.save.mockResolvedValue(updatedTx);

      await service.updateStatus('tx-uuid-1', TransactionStatus.COMPLETED);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.status_updated',
        expect.objectContaining({
          amount: 150.50,
        }),
      );
    });
  });
});