import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('RabbitMQPublisher', () => {
  let publisher: RabbitMQPublisher;
  let consoleSpy: jest.SpyInstance;
  
  const mockChannel = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockReturnValue(true),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);
    
    publisher = new RabbitMQPublisher();
    process.env.RABBITMQ_URL = 'amqp://localhost';
    await publisher.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(publisher).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ', async () => {
      expect(amqp.connect).toHaveBeenCalledWith(process.env.RABBITMQ_URL);
    });

    it('should create a channel', async () => {
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should assert queue', async () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'transactions_service_queue',
        { durable: true },
      );
    });

    it('should bind queue to exchange', async () => {
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'transactions_service_queue',
        'users.events',
        '#',
      );
    });

    it('should assert exchange', async () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'users.events',
        'topic',
        { durable: true },
      );
    });

    it('should log connection success', async () => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[RabbitMQ] Connected and exchange ready:',
        'users.events',
      );
    });
  });

  describe('publish', () => {
    it('should publish message to exchange', async () => {
      const event = 'user.created';
      const payload = { userId: '1', email: 'test@example.com' };

      await publisher.publish(event, payload);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'users.events',
        event,
        Buffer.from(JSON.stringify(payload)),
      );
    });

    it('should publish different event types', async () => {
      const event = 'banking_details.updated';
      const payload = { userId: '1', details: { agency: '237' } };

      await publisher.publish(event, payload);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'users.events',
        event,
        expect.any(Buffer),
      );
    });

    it('should handle complex payload', async () => {
      const payload = {
        event: 'user.created',
        userId: '123',
        nested: {
          deep: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
        timestamp: new Date().toISOString(),
      };

      await publisher.publish('user.created', payload);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'users.events',
        'user.created',
        Buffer.from(JSON.stringify(payload)),
      );
    });
  });
});