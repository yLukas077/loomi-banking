import { RabbitMQPublisher } from '../../src/rabbitmq/rabbitmq.publisher';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('RabbitMQPublisher', () => {
  let publisher: RabbitMQPublisher;
  let mockChannel: any;
  let mockConnection: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    publisher = new RabbitMQPublisher();
    process.env.RABBITMQ_URL = 'amqp://localhost';
    await publisher.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ', () => {
      expect(amqp.connect).toHaveBeenCalledWith(process.env.RABBITMQ_URL);
    });

    it('should create a channel', () => {
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should publish message to transactions exchange', async () => {
      const routingKey = 'transaction.created';
      const message = { transactionId: 'tx-1', userId: 'user-1', amount: 100 };

      await publisher.publish(routingKey, message);

      expect(mockChannel.assertExchange).toHaveBeenCalledWith('transactions', 'topic', { durable: true });
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'transactions',
        routingKey,
        Buffer.from(JSON.stringify(message)),
      );
    });

    it('should publish status update event', async () => {
      const routingKey = 'transaction.status_updated';
      const message = { transactionId: 'tx-1', newStatus: 'completed' };

      await publisher.publish(routingKey, message);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'transactions',
        routingKey,
        expect.any(Buffer),
      );
    });

    it('should throw error if channel is not initialized', async () => {
      const uninitializedPublisher = new RabbitMQPublisher();

      await expect(uninitializedPublisher.publish('test', {})).rejects.toThrow('RabbitMQ channel not initialized');
    });

    it('should handle complex message payload', async () => {
      const message = {
        event: 'transaction.created',
        transactionId: 'tx-123',
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        timestamp: new Date().toISOString(),
      };

      await publisher.publish('transaction.created', message);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'transactions',
        'transaction.created',
        Buffer.from(JSON.stringify(message)),
      );
    });
  });
});
