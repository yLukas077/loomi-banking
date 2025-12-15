import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from '../../src/transactions/entities/transaction.entity';
import { TransactionsController } from '../../src/transactions/transactions.controller';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';

// Mocks
const mockRabbitMQPublisher = {
  publish: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockIdempotencyService = {
  checkOrSave: jest.fn().mockResolvedValue(null),
  saveResponse: jest.fn().mockResolvedValue(undefined),
};

describe('Transactions E2E', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let repository: Repository<Transaction>;
  let createdTransactionId: string;

  const senderUserId = 'e1120ea7-83cf-42c2-b358-63b8637509c7';
  const receiverUserId = 'f2230fb8-94df-43d3-a469-74c9748610d8';

  const setupDefaultMocks = () => {
    mockRedisService.get.mockImplementation((key: string) => {
      if (key === `user:${senderUserId}`) {
        return Promise.resolve({ id: senderUserId, name: 'Sender User', email: 'sender@example.com' });
      }
      if (key === `user:${senderUserId}:banking`) {
        return Promise.resolve({ agency: '237', accountNumber: '12345678', accountType: 'checking' });
      }
      if (key === `user:${receiverUserId}`) {
        return Promise.resolve({ id: receiverUserId, name: 'Receiver User', email: 'receiver@example.com' });
      }
      if (key === `user:${receiverUserId}:banking`) {
        return Promise.resolve({ agency: '341', accountNumber: '87654321', accountType: 'savings' });
      }
      return Promise.resolve(null);
    });
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine').start();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getPort(),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          entities: [Transaction],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Transaction]),
      ],
      controllers: [TransactionsController],
      providers: [
        TransactionsService,
        { provide: RabbitMQPublisher, useValue: mockRabbitMQPublisher },
        { provide: RedisService, useValue: mockRedisService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    repository = moduleFixture.get<Repository<Transaction>>(getRepositoryToken(Transaction));

    // Setup mocks before creating initial transaction
    setupDefaultMocks();

    // Create initial transaction for later tests
    const tx = repository.create({
      receiverUserId,
      type: TransactionType.DEPOSIT,
      amount: 50,
      status: TransactionStatus.PENDING,
    });
    const saved = await repository.save(tx);
    createdTransactionId = saved.id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ==================== POST /transactions - DEPOSIT ====================
  describe('POST /transactions - Deposit', () => {
    it('should create a deposit transaction (201)', async () => {
      // Ensure mocks are properly setup
      setupDefaultMocks();

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: TransactionType.DEPOSIT,
          amount: 100.50,
          description: 'Test deposit',
        });

      // Log response for debugging
      if (res.status !== 201) {
        console.log('Deposit failed:', res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.receiverUserId).toBe(receiverUserId);
      expect(res.body.senderUserId).toBeNull();
      expect(res.body.type).toBe(TransactionType.DEPOSIT);
      expect(res.body.status).toBe(TransactionStatus.PENDING);
    });

    it('should return 400 when receiver does not exist for deposit', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId: 'a0000000-0000-0000-0000-000000000000',
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for deposit without receiverUserId', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(400);
    });
  });

  // ==================== POST /transactions - WITHDRAW ====================
  describe('POST /transactions - Withdraw', () => {
    it('should create a withdraw transaction (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          type: TransactionType.WITHDRAW,
          amount: 50,
        })
        .expect(201);

      expect(res.body.senderUserId).toBe(senderUserId);
      expect(res.body.receiverUserId).toBeNull();
      expect(res.body.type).toBe(TransactionType.WITHDRAW);
    });

    it('should return 400 when sender has no banking details for withdraw', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === `user:${senderUserId}`) {
          return Promise.resolve({ id: senderUserId, name: 'Sender User' });
        }
        return Promise.resolve(null);
      });

      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          type: TransactionType.WITHDRAW,
          amount: 50,
        })
        .expect(400);
    });

    it('should return 400 for withdraw without senderUserId', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          type: TransactionType.WITHDRAW,
          amount: 50,
        })
        .expect(400);
    });
  });

  // ==================== POST /transactions - TRANSFER ====================
  describe('POST /transactions - Transfer', () => {
    it('should create a transfer transaction (201)', async () => {
      // Ensure mocks are properly setup
      setupDefaultMocks();

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          receiverUserId,
          type: TransactionType.TRANSFER,
          amount: 200,
          description: 'Transfer between accounts',
        });

      // Log response for debugging
      if (res.status !== 201) {
        console.log('Transfer failed:', res.body);
      }

      expect(res.status).toBe(201);
      expect(res.body.senderUserId).toBe(senderUserId);
      expect(res.body.receiverUserId).toBe(receiverUserId);
      expect(res.body.type).toBe(TransactionType.TRANSFER);
    });

    it('should return 400 when transferring to same account', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          receiverUserId: senderUserId,
          type: TransactionType.TRANSFER,
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for transfer without senderUserId', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: TransactionType.TRANSFER,
          amount: 200,
        })
        .expect(400);
    });

    it('should return 400 for transfer without receiverUserId', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          type: TransactionType.TRANSFER,
          amount: 200,
        })
        .expect(400);
    });

    it('should return 400 when receiver has no banking details for transfer', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === `user:${senderUserId}`) {
          return Promise.resolve({ id: senderUserId, name: 'Sender User' });
        }
        if (key === `user:${senderUserId}:banking`) {
          return Promise.resolve({ agency: '237', accountNumber: '12345678', accountType: 'checking' });
        }
        if (key === `user:${receiverUserId}`) {
          return Promise.resolve({ id: receiverUserId, name: 'Receiver User' });
        }
        return Promise.resolve(null);
      });

      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          receiverUserId,
          type: TransactionType.TRANSFER,
          amount: 200,
        })
        .expect(400);
    });

    it('should call RabbitMQ publisher with type and amount on transfer creation', async () => {
      // Ensure mocks are properly setup
      setupDefaultMocks();

      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          receiverUserId,
          type: TransactionType.TRANSFER,
          amount: 100,
        });

      if (res.status !== 201) {
        console.log('Transfer for publisher test failed:', res.body);
      }

      expect(res.status).toBe(201);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          event: 'transaction.created',
          senderUserId,
          receiverUserId,
          type: TransactionType.TRANSFER,
          amount: 100,
        }),
      );
    });
  });

  // ==================== COMMON VALIDATIONS ====================
  describe('POST /transactions - Common validations', () => {
    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId: 'invalid-uuid',
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for negative amount', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: TransactionType.DEPOSIT,
          amount: -100,
        })
        .expect(400);
    });

    it('should return 400 for zero amount', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: TransactionType.DEPOSIT,
          amount: 0,
        })
        .expect(400);
    });

    it('should return 400 for invalid transaction type', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: 'invalid_type',
          amount: 100,
        })
        .expect(400);
    });
  });

  // ==================== GET /transactions ====================
  describe('GET /transactions', () => {
    it('should return all transactions (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should return transactions filtered by userId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/transactions?userId=${receiverUserId}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach((tx: any) => {
        expect(tx.senderUserId === receiverUserId || tx.receiverUserId === receiverUserId).toBe(true);
      });
    });

    it('should return transactions ordered by createdAt DESC', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);

      if (res.body.length > 1) {
        const dates = res.body.map((tx: any) => new Date(tx.createdAt).getTime());
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });
  });

  // ==================== GET /transactions/:id ====================
  describe('GET /transactions/:id', () => {
    it('should return a transaction by id (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/transactions/${createdTransactionId}`)
        .expect(200);

      expect(res.body.id).toBe(createdTransactionId);
    });

    it('should return 404 for non-existent transaction', async () => {
      await request(app.getHttpServer())
        .get('/transactions/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ==================== PATCH /transactions/:id/status ====================
  describe('PATCH /transactions/:id/status', () => {
    it('should update transaction status to COMPLETED and publish event with type and amount', async () => {
      // Ensure mocks are setup
      setupDefaultMocks();

      // Create a new transaction first
      const createRes = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          receiverUserId,
          type: TransactionType.DEPOSIT,
          amount: 100,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeDefined();

      jest.clearAllMocks();
      setupDefaultMocks();

      const res = await request(app.getHttpServer())
        .patch(`/transactions/${createRes.body.id}/status`)
        .send({ status: TransactionStatus.COMPLETED })
        .expect(200);

      expect(res.body.status).toBe(TransactionStatus.COMPLETED);
      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.status_updated',
        expect.objectContaining({
          event: 'transaction.status_updated',
          transactionId: createRes.body.id,
          type: TransactionType.DEPOSIT,
          amount: expect.any(Number),
          newStatus: TransactionStatus.COMPLETED,
        }),
      );
    });

    it('should update transaction status to FAILED', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          senderUserId,
          type: TransactionType.WITHDRAW,
          amount: 50,
        });

      const res = await request(app.getHttpServer())
        .patch(`/transactions/${createRes.body.id}/status`)
        .send({ status: TransactionStatus.FAILED })
        .expect(200);

      expect(res.body.status).toBe(TransactionStatus.FAILED);
    });

    it('should return 404 for non-existent transaction', async () => {
      await request(app.getHttpServer())
        .patch('/transactions/00000000-0000-0000-0000-000000000000/status')
        .send({ status: TransactionStatus.COMPLETED })
        .expect(404);
    });

    it('should return 400 for invalid status', async () => {
      await request(app.getHttpServer())
        .patch(`/transactions/${createdTransactionId}/status`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });
  });
});