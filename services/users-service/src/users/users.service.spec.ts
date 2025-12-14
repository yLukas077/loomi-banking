import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from './users.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { BankingDetails } from './entities/banking-details.entity'
import { Repository } from 'typeorm'
import { RedisService } from '../redis/redis.service'
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'
import { IdempotencyService } from '../common/idempotency/idempotency.service'


const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: overrides.id ?? '1',
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? 'test@example.com',
    address: overrides.address ?? 'BR',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    bankingDetails: overrides.bankingDetails ?? undefined,
  } as User)

describe('UsersService', () => {
  let service: UsersService

  let mockUserRepository: jest.Mocked<Repository<User>>
  let mockDetailsRepository: jest.Mocked<Repository<BankingDetails>>
  let mockRedis: jest.Mocked<RedisService>
  let mockPublisher: jest.Mocked<RabbitMQPublisher>
  let mockIdempotency: jest.Mocked<IdempotencyService>

  beforeEach(async () => {
    mockUserRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as any

    mockDetailsRepository = {
      create: jest.fn(),
      save: jest.fn(),
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
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(BankingDetails), useValue: mockDetailsRepository },
        { provide: RedisService, useValue: mockRedis },
        { provide: RabbitMQPublisher, useValue: mockPublisher },
        { provide: IdempotencyService, useValue: mockIdempotency },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
  })

  // ------------------------------------------------------------------------------------------
  // CREATE USER
  // ------------------------------------------------------------------------------------------
  it('should create a new user', async () => {
    mockUserRepository.findOne.mockResolvedValue(null)

    mockUserRepository.create.mockReturnValue(
      mockUser({ name: 'Test', email: 't@example.com' }),
    )

    mockUserRepository.save.mockResolvedValue(
      mockUser({ id: '1', name: 'Test', email: 't@example.com' }),
    )

    const result = await service.create({
      name: 'Test',
      email: 't@example.com',
      address: 'BR',
    })

    expect(result.id).toBe('1')
    expect(mockPublisher.publish).toHaveBeenCalled()
  })

  // ------------------------------------------------------------------------------------------
  // CACHE HIT
  // ------------------------------------------------------------------------------------------
  it('should return user from cache', async () => {
    const cachedUser = mockUser({ id: 'cached' })

    mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser))

    const result = await service.findById('cached')

    expect(result.id).toBe('cached')
    expect(mockUserRepository.findOne).not.toHaveBeenCalled()
  })

  // ------------------------------------------------------------------------------------------
  // CACHE MISS
  // ------------------------------------------------------------------------------------------
  it('should fetch DB when cache empty', async () => {
    mockRedis.get.mockResolvedValue(null)

    mockUserRepository.findOne.mockResolvedValue(
      mockUser({ id: '1', name: 'DB User' }),
    )

    const result = await service.findById('1')

    expect(result.name).toBe('DB User')
    expect(mockRedis.set).toHaveBeenCalled()
  })

  // ------------------------------------------------------------------------------------------
  // UPDATE USER
  // ------------------------------------------------------------------------------------------
  it('should update a user', async () => {
    mockUserRepository.findOne
      .mockResolvedValueOnce(mockUser({ id: '1', email: 'old@example.com' }))
      .mockResolvedValueOnce(null)

    mockUserRepository.save.mockResolvedValue(
      mockUser({ id: '1', email: 'new@example.com' }),
    )

    const result = await service.update('1', { email: 'new@example.com' })

    expect(result.email).toBe('new@example.com')
    expect(mockRedis.del).toHaveBeenCalledWith('users:1')
  })

  // ------------------------------------------------------------------------------------------
  // DELETE USER
  // ------------------------------------------------------------------------------------------
  it('should delete a user', async () => {
    mockUserRepository.findOne.mockResolvedValue(mockUser({ id: '1' }))
    mockUserRepository.delete.mockResolvedValue({ affected: 1 } as any)

    const result = await service.delete('1')

    expect(result).toBe(true)
    expect(mockRedis.del).toHaveBeenCalledWith('users:1')
  })
})
