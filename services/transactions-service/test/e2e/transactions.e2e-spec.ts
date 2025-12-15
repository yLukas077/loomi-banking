import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { TransactionsModule } from '../../src/transactions/transactions.module';
import { Transaction, TransactionStatus, TransactionType } from '../../src/transactions/entities/transaction.entity';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { TransactionsConsumer } from '../../src/rabbitmq/transactions.consumer';

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

const mockTransactionsConsumer = {
  onModuleInit: jest.fn().mockResolvedValue(undefined),
};

describe('Transactions E2E', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let createdTransactionId: string;
  const testUserId = 'e1120ea7-83cf-42c2-b358-63b8637509c7';

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
        TransactionsModule,
      ],
    })
      .overrideProvider(RabbitMQPublisher)
      .useValue(mockRabbitMQPublisher)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(IdempotencyService)
      .useValue(mockIdempotencyService)
      .overrideProvider(TransactionsConsumer)
      .useValue(mockTransactionsConsumer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (container) {
      await container.stop();
    }
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user exists
    mockRedisService.get.mockImplementation((key: string) => {
      if (key === `user:${testUserId}`) {
        return Promise.resolve({ id: testUserId, name: 'Test User', email: 'test@example.com' });
      }
      if (key === `user:${testUserId}:banking`) {
        return Promise.resolve({ agency: '237', accountNumber: '12345678', accountType: 'checking' });
      }
      return Promise.resolve(null);
    });
  });

  // ==================== POST /transactions ====================
  describe('POST /transactions', () => {
    it('should create a deposit transaction (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: 100.50,
          description: 'Test deposit',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.userId).toBe(testUserId);
      expect(res.body.type).toBe(TransactionType.DEPOSIT);
      expect(res.body.status).toBe(TransactionStatus.PENDING);

      createdTransactionId = res.body.id;
    });

    it('should create a withdraw transaction (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.WITHDRAW,
          amount: 50,
        })
        .expect(201);

      expect(res.body.type).toBe(TransactionType.WITHDRAW);
    });

    it('should create a transfer transaction (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.TRANSFER,
          amount: 200,
          description: 'Transfer to savings',
        })
        .expect(201);

      expect(res.body.type).toBe(TransactionType.TRANSFER);
    });

    it('should return 400 when user does not exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: 'a0000000-0000-0000-0000-000000000000',
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for withdraw without banking details', async () => {
      mockRedisService.get.mockImplementation((key: string) => {
        if (key === `user:${testUserId}`) {
          return Promise.resolve({ id: testUserId, name: 'Test User' });
        }
        return Promise.resolve(null); // No banking details
      });

      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.WITHDRAW,
          amount: 50,
        })
        .expect(400);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: 'invalid-uuid',
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for negative amount', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: -100,
        })
        .expect(400);
    });

    it('should return 400 for zero amount', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: 0,
        })
        .expect(400);
    });

    it('should return 400 for invalid transaction type', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: 'invalid_type',
          amount: 100,
        })
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({})
        .expect(400);
    });

    it('should call RabbitMQ publisher on transaction creation', async () => {
      await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: 100,
        })
        .expect(201);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.created',
        expect.objectContaining({
          event: 'transaction.created',
          userId: testUserId,
        }),
      );
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
    it('should update transaction status to COMPLETED (200)', async () => {
      // Create a new transaction for this test
      const createRes = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: 100,
        });

      const res = await request(app.getHttpServer())
        .patch(`/transactions/${createRes.body.id}/status`)
        .send({ status: TransactionStatus.COMPLETED })
        .expect(200);

      expect(res.body.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should update transaction status to FAILED (200)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
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

    it('should call RabbitMQ publisher on status update', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions')
        .send({
          userId: testUserId,
          type: TransactionType.DEPOSIT,
          amount: 100,
        });

      jest.clearAllMocks();

      await request(app.getHttpServer())
        .patch(`/transactions/${createRes.body.id}/status`)
        .send({ status: TransactionStatus.COMPLETED })
        .expect(200);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'transaction.status_updated',
        expect.objectContaining({
          event: 'transaction.status_updated',
          transactionId: createRes.body.id,
          newStatus: TransactionStatus.COMPLETED,
        }),
      );
    });
  });
});