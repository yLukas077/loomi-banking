import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { UsersModule } from '../../src/users/users.module';
import { User } from '../../src/users/entities/user.entity';
import { BankingDetails } from '../../src/users/entities/banking-details.entity';
import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import { RedisService } from '../../src/redis/redis.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';

// Mocks
const mockRabbitMQPublisher = {
  publish: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
};

const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn().mockResolvedValue(undefined),
};

const mockIdempotencyService = {
  get: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
};

describe('Users E2E', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let createdUserId: string;

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
          entities: [User, BankingDetails],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, BankingDetails]),
        UsersModule,
      ],
    })
      .overrideProvider(RabbitMQPublisher)
      .useValue(mockRabbitMQPublisher)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(IdempotencyService)
      .useValue(mockIdempotencyService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== POST /users ====================
  describe('POST /users', () => {
    it('should create a user successfully (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Lucas Almeida', email: 'lucas@example.com' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Lucas Almeida');
      expect(res.body.email).toBe('lucas@example.com');

      createdUserId = res.body.id;
    });

    it('should create a user with address (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({
          name: 'Maria Silva',
          email: 'maria@example.com',
          address: 'Av. Brasil, 123',
        })
        .expect(201);

      expect(res.body.address).toBe('Av. Brasil, 123');
    });

    it('should return 409 when email already exists', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Another User', email: 'lucas@example.com' })
        .expect(409);
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Test User', email: 'invalid-email' })
        .expect(400);
    });

    it('should return 400 for name too short', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Lu', email: 'short@example.com' })
        .expect(400);
    });

    it('should return 400 for name with invalid characters', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Test123', email: 'test123@example.com' })
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({})
        .expect(400);
    });

    it('should call RabbitMQ publisher on user creation', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Publisher Test', email: 'publisher@example.com' })
        .expect(201);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'user.created',
        expect.objectContaining({
          event: 'user.created',
          email: 'publisher@example.com',
        }),
      );
    });
  });

  // ==================== GET /users ====================
  describe('GET /users', () => {
    it('should return all users (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should return users ordered by createdAt DESC', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .expect(200);

      if (res.body.length > 1) {
        const dates = res.body.map((u: any) => new Date(u.createdAt).getTime());
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });
  });

  // ==================== GET /users/:id ====================
  describe('GET /users/:id', () => {
    it('should return a user by id (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${createdUserId}`)
        .expect(200);

      expect(res.body.id).toBe(createdUserId);
      expect(res.body.name).toBe('Lucas Almeida');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ==================== PATCH /users/:id ====================
  describe('PATCH /users/:id', () => {
    it('should update user name (200)', async () => {
      // Create a fresh user for this test
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Update Name Test', email: 'updatename@example.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/users/${createRes.body.id}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');

      // Verify the update persisted
      const getRes = await request(app.getHttpServer())
        .get(`/users/${createRes.body.id}`)
        .expect(200);

      expect(getRes.body.name).toBe('Updated Name');
      expect(getRes.body.email).toBe('updatename@example.com'); // unchanged
    });

    it('should update user email (200)', async () => {
      // Create a fresh user for this test
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Update Email Test', email: 'updateemail@example.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/users/${createRes.body.id}`)
        .send({ email: 'newemail@example.com' })
        .expect(200);

      expect(res.body.email).toBe('newemail@example.com');

      // Verify the update persisted
      const getRes = await request(app.getHttpServer())
        .get(`/users/${createRes.body.id}`)
        .expect(200);

      expect(getRes.body.email).toBe('newemail@example.com');
      expect(getRes.body.name).toBe('Update Email Test'); // unchanged
    });

    it('should update user address (200)', async () => {
      // Create a fresh user for this test
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Update Address Test', email: 'updateaddress@example.com' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/users/${createRes.body.id}`)
        .send({ address: 'Rua Nova, 456' })
        .expect(200);

      expect(res.body.address).toBe('Rua Nova, 456');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Test' })
        .expect(404);
    });

    it('should return 409 when updating to existing email', async () => {
      // Create two users
      const user1 = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'User One', email: 'userone@example.com' });

      await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'User Two', email: 'usertwo@example.com' });

      // Try to update user1 to user2's email
      await request(app.getHttpServer())
        .patch(`/users/${user1.body.id}`)
        .send({ email: 'usertwo@example.com' })
        .expect(409);
    });

    it('should return 400 for invalid name', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}`)
        .send({ name: 'Ab' }) // too short
        .expect(400);
    });
  });

  // ==================== PATCH /users/:id/banking-details ====================
  describe('PATCH /users/:id/banking-details', () => {
    it('should set banking details (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: '237',
          accountNumber: '00099922',
          accountType: 'checking',
        })
        .expect(200);

      expect(res.body.agency).toBe('237');
      expect(res.body.accountNumber).toBe('00099922');
      expect(res.body.accountType).toBe('checking');
    });

    it('should update existing banking details (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: '341',
          accountNumber: '11111111',
          accountType: 'savings',
        })
        .expect(200);

      expect(res.body.agency).toBe('341');
      expect(res.body.accountType).toBe('savings');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000/banking-details')
        .send({
          agency: '237',
          accountNumber: '00099922',
          accountType: 'checking',
        })
        .expect(404);
    });

    it('should return 400 for invalid agency (non-numeric)', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: 'ABC',
          accountNumber: '00099922',
          accountType: 'checking',
        })
        .expect(400);
    });

    it('should return 400 for invalid account type', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: '237',
          accountNumber: '00099922',
          accountType: 'invalid',
        })
        .expect(400);
    });

    it('should return 400 for agency too short', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: '12', // min 3
          accountNumber: '00099922',
          accountType: 'checking',
        })
        .expect(400);
    });

    it('should return 400 for account number too short', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/banking-details`)
        .send({
          agency: '237',
          accountNumber: '12345', // min 6
          accountType: 'checking',
        })
        .expect(400);
    });

    it('should call RabbitMQ publisher on banking details update', async () => {
      // Create a new user for this test
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Banking Test', email: 'banking@example.com' });

      jest.clearAllMocks();

      await request(app.getHttpServer())
        .patch(`/users/${createRes.body.id}/banking-details`)
        .send({
          agency: '237',
          accountNumber: '12345678',
          accountType: 'checking',
        })
        .expect(200);

      expect(mockRabbitMQPublisher.publish).toHaveBeenCalledWith(
        'banking_details.updated',
        expect.objectContaining({
          event: 'banking_details.updated',
          userId: createRes.body.id,
        }),
      );
    });
  });

  // ==================== DELETE /users/:id ====================
  describe('DELETE /users/:id', () => {
    it('should delete a user (200)', async () => {
      // Create a user to delete
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'To Delete', email: 'todelete@example.com' });

      const userIdToDelete = createRes.body.id;

      const res = await request(app.getHttpServer())
        .delete(`/users/${userIdToDelete}`)
        .expect(200);

      expect(res.body).toEqual({ deleted: true });

      // Verify user is deleted
      await request(app.getHttpServer())
        .get(`/users/${userIdToDelete}`)
        .expect(404);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .delete('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should cascade delete banking details', async () => {
      // Create user with banking details
      const createRes = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'With Banking', email: 'withbanking@example.com' });

      const userId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/users/${userId}/banking-details`)
        .send({
          agency: '237',
          accountNumber: '00099922',
          accountType: 'checking',
        });

      // Delete user
      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .expect(200);

      // User should be gone
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .expect(404);
    });
  });
});