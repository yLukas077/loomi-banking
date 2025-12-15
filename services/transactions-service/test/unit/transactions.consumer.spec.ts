import { TransactionsConsumer } from '../../src/rabbitmq/transactions.consumer';
import { RedisService } from '../../src/redis/redis.service';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('TransactionsConsumer', () => {
  let consumer: TransactionsConsumer;
  let mockRedisService: any;
  let mockChannel: any;
  let mockConnection: any;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'transactions_service_queue' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    consumer = new TransactionsConsumer(mockRedisService);
    loggerSpy = jest.spyOn(consumer['logger'], 'log').mockImplementation();
    jest.spyOn(consumer['logger'], 'error').mockImplementation();

    process.env.RABBITMQ_URL = 'amqp://localhost';
    await consumer.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ', () => {
      expect(amqp.connect).toHaveBeenCalledWith(process.env.RABBITMQ_URL);
    });

    it('should create a channel', () => {
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert exchange', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('users.events', 'topic', { durable: true });
    });

    it('should assert queue', () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('transactions_service_queue', { durable: true });
    });

    it('should bind queue to exchange', () => {
      expect(mockChannel.bindQueue).toHaveBeenCalledWith('transactions_service_queue', 'users.events', '#');
    });

    it('should start consuming messages', () => {
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'transactions_service_queue',
        expect.any(Function),
        { noAck: false },
      );
    });

    it('should log initialization', () => {
      expect(loggerSpy).toHaveBeenCalledWith('TransactionsConsumer listening for users.* events');
    });
  });

  describe('handleMessage', () => {
    it('should handle user.created event', async () => {
      const payload = { userId: 'user-1', name: 'Test User', email: 'test@example.com' };
      const msg = {
        fields: { routingKey: 'user.created' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      // Get the consume callback
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'user:user-1',
        { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        86400,
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle banking_details.updated event', async () => {
      const payload = {
        userId: 'user-1',
        details: { agency: '237', accountNumber: '12345678', accountType: 'checking' },
      };
      const msg = {
        fields: { routingKey: 'banking_details.updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'user:user-1:banking',
        payload.details,
        86400,
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle null message', async () => {
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(null);

      expect(mockRedisService.set).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should nack message on error', async () => {
      const msg = {
        fields: { routingKey: 'user.created' },
        content: Buffer.from('invalid json'),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('should handle unknown event types gracefully', async () => {
      const payload = { data: 'test' };
      const msg = {
        fields: { routingKey: 'unknown.event' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });
});
