import { Test, TestingModule } from '@nestjs/testing'
import { TransactionsService } from './transactions.service'
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RedisService } from '../redis/redis.service'
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'
import { IdempotencyService } from '../common/idempotency/idempotency.service'
import { BadRequestException, NotFoundException } from '@nestjs/common'

const mockTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: overrides.id ?? 'tx-1',
    userId: overrides.userId ?? 'user-1',
    type: overrides.type ?? TransactionType.DEPOSIT,
    amount: overrides.amount ?? 100,
    status: overrides.status ?? TransactionStatus.PENDING,
    description: overrides.description ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  } as Transaction)

describe('TransactionsService', () => {
  let service: TransactionsService

  let mockTxRepo: jest.Mocked<Repository<Transaction>>
  let mockRedis: jest.Mocked<RedisService>
  let mockPublisher: jest.Mocked<RabbitMQPublisher>
  let mockIdempotency: jest.Mocked<IdempotencyService>

  beforeEach(async () => {
    mockTxRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    } as any

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any

    mockPublisher = {
      publish: jest.fn(),
    } as any

    mockIdempotency = {
      checkOrSaveKey: jest.fn().mockResolvedValue({ isDuplicate: false }),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitMQPublisher, useValue: mockPublisher },
        { provide: IdempotencyService, useValue: mockIdempotency },
      ],
    }).compile()

    service = module.get<TransactionsService>(TransactionsService)
  })

  // ------------------------------------------------------------------------------------------
  // SUCCESS: CREATE TRANSACTION
  // ------------------------------------------------------------------------------------------
  it('should create a transaction', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ id: 'user-1', name: 'Test' }))

    mockTxRepo.create.mockReturnValue(mockTx({ id: 'tx-1' }))
    mockTxRepo.save.mockResolvedValue(mockTx({ id: 'tx-1' }))

    const result = await service.create({
      userId: 'user-1',
      type: TransactionType.DEPOSIT,
      amount: 200,
    })

    expect(result.id).toBe('tx-1')
    expect(mockPublisher.publish).toHaveBeenCalled()
  })

  // ------------------------------------------------------------------------------------------
  // ERROR: USER NOT FOUND IN CACHE
  // ------------------------------------------------------------------------------------------
  it('should fail if user is not cached', async () => {
    mockRedis.get.mockResolvedValue(null)

    await expect(
      service.create({
        userId: 'invalid',
        type: TransactionType.DEPOSIT,
        amount: 50,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  // ------------------------------------------------------------------------------------------
  // ERROR: MISSING BANKING DETAILS FOR WITHDRAW / TRANSFER
  // ------------------------------------------------------------------------------------------
  it('should reject withdraw without banking details', async () => {
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify({ id: 'user-1' }))
      .mockResolvedValueOnce(null) 

    await expect(
      service.create({
        userId: 'user-1',
        type: TransactionType.WITHDRAW,
        amount: 50,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  // ------------------------------------------------------------------------------------------
  // SUCCESS: UPDATE STATUS
  // ------------------------------------------------------------------------------------------
  it('should update a transaction status', async () => {
    mockTxRepo.findOne.mockResolvedValue(
      mockTx({ id: 'tx-1', status: TransactionStatus.PENDING }),
    )

    mockTxRepo.save.mockResolvedValue(
      mockTx({ id: 'tx-1', status: TransactionStatus.COMPLETED }),
    )

    const updated = await service.updateStatus('tx-1', TransactionStatus.COMPLETED)

    expect(updated.status).toBe(TransactionStatus.COMPLETED)
    expect(mockPublisher.publish).toHaveBeenCalled()
  })

  // ------------------------------------------------------------------------------------------
  // ERROR: UPDATE STATUS ON NON-EXISTENT TRANSACTION
  // ------------------------------------------------------------------------------------------
    it('should throw NotFoundException when updating nonexistent transaction', async () => {
    mockTxRepo.findOne.mockResolvedValue(null)

    await expect(
        service.updateStatus('wrong-id', TransactionStatus.FAILED),
    ).rejects.toThrow(NotFoundException)
    })


  // ------------------------------------------------------------------------------------------
  // FIND ALL
  // ------------------------------------------------------------------------------------------
  it('should return all transactions', async () => {
    mockTxRepo.find.mockResolvedValue([
      mockTx({ id: 'tx-1' }),
      mockTx({ id: 'tx-2' }),
    ])

    const list = await service.findAll()

    expect(list.length).toBe(2)
  })

  // ------------------------------------------------------------------------------------------
  // FIND BY ID
  // ------------------------------------------------------------------------------------------
  it('should return a transaction by ID', async () => {
    mockTxRepo.findOne.mockResolvedValue(mockTx({ id: 'tx-123' }))

    const tx = await service.findById('tx-123')

    expect(tx.id).toBe('tx-123')
  })

  it('should throw NotFoundException when transaction not found', async () => {
    mockTxRepo.findOne.mockResolvedValue(null)

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException)
  })
})
