import { TransactionsConsumer } from '../../src/rabbitmq/transactions.consumer';
import { Repository } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('TransactionsConsumer', () => {
  let consumer: TransactionsConsumer;
  let mockUserRepository: Partial<Repository<User>>;
  let mockChannel: any;
  let mockConnection: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'users_service_transactions_queue' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    consumer = new TransactionsConsumer(mockUserRepository as Repository<User>);
    jest.spyOn(consumer['logger'], 'log').mockImplementation();
    jest.spyOn(consumer['logger'], 'warn').mockImplementation();
    jest.spyOn(consumer['logger'], 'error').mockImplementation();

    process.env.RABBITMQ_URL = 'amqp://localhost';
    await consumer.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('should connect to RabbitMQ', () => {
      expect(amqp.connect).toHaveBeenCalledWith(process.env.RABBITMQ_URL);
    });

    it('should assert exchange', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('transactions', 'topic', { durable: true });
    });

    it('should assert queue', () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('users_service_transactions_queue', { durable: true });
    });

    it('should bind queue to transaction.status_updated', () => {
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'users_service_transactions_queue',
        'transactions',
        'transaction.status_updated',
      );
    });

    it('should start consuming messages', () => {
      expect(mockChannel.consume).toHaveBeenCalled();
    });
  });

  describe('handleMessage - deposit completed', () => {
    it('should add balance to receiver on deposit completed', async () => {
      const user = { id: 'receiver-1', name: 'Test', balance: 100 };
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue({ ...user });
      (mockUserRepository.save as jest.Mock).mockResolvedValue({ ...user, balance: 200 });

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'receiver-1',
        type: 'deposit',
        amount: 100,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: 'receiver-1' } });
      expect(mockUserRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: 200 }));
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle decimal amounts correctly', async () => {
      const user = { id: 'receiver-1', name: 'Test', balance: 100.50 };
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue({ ...user });
      (mockUserRepository.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'receiver-1',
        type: 'deposit',
        amount: 50.25,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: 150.75 }));
    });
  });

  describe('handleMessage - withdraw completed', () => {
    it('should subtract balance from sender on withdraw completed', async () => {
      const user = { id: 'sender-1', name: 'Test', balance: 100 };
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue({ ...user });
      (mockUserRepository.save as jest.Mock).mockResolvedValue({ ...user, balance: 50 });

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        senderUserId: 'sender-1',
        type: 'withdraw',
        amount: 50,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: 50 }));
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should allow negative balance on withdraw', async () => {
      const user = { id: 'sender-1', name: 'Test', balance: 30 };
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue({ ...user });
      (mockUserRepository.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        senderUserId: 'sender-1',
        type: 'withdraw',
        amount: 50,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).toHaveBeenCalledWith(expect.objectContaining({ balance: -20 }));
    });
  });

  describe('handleMessage - transfer completed', () => {
    it('should subtract from sender and add to receiver on transfer completed', async () => {
      const sender = { id: 'sender-1', name: 'Sender', balance: 500 };
      const receiver = { id: 'receiver-1', name: 'Receiver', balance: 100 };

      (mockUserRepository.findOne as jest.Mock)
        .mockResolvedValueOnce({ ...sender })
        .mockResolvedValueOnce({ ...receiver });

      (mockUserRepository.save as jest.Mock)
        .mockResolvedValueOnce({ ...sender, balance: 300 })
        .mockResolvedValueOnce({ ...receiver, balance: 300 });

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        senderUserId: 'sender-1',
        receiverUserId: 'receiver-1',
        type: 'transfer',
        amount: 200,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.findOne).toHaveBeenCalledTimes(2);
      expect(mockUserRepository.save).toHaveBeenCalledTimes(2);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle transfer with string balance from DB', async () => {
      const sender = { id: 'sender-1', name: 'Sender', balance: '500.00' };
      const receiver = { id: 'receiver-1', name: 'Receiver', balance: '100.00' };

      (mockUserRepository.findOne as jest.Mock)
        .mockResolvedValueOnce({ ...sender })
        .mockResolvedValueOnce({ ...receiver });

      (mockUserRepository.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        senderUserId: 'sender-1',
        receiverUserId: 'receiver-1',
        type: 'transfer',
        amount: 200,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ balance: 300 }));
      expect(mockUserRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ balance: 300 }));
    });
  });

  describe('handleMessage - non-completed status', () => {
    it('should not update balance for pending transactions', async () => {
      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'receiver-1',
        type: 'deposit',
        amount: 100,
        newStatus: 'pending',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should not update balance for failed transactions', async () => {
      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'receiver-1',
        type: 'deposit',
        amount: 100,
        newStatus: 'failed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });
  });

  describe('handleMessage - user not found', () => {
    it('should handle sender not found gracefully', async () => {
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue(null);

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        senderUserId: 'non-existent',
        type: 'withdraw',
        amount: 100,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should handle receiver not found gracefully', async () => {
      (mockUserRepository.findOne as jest.Mock).mockResolvedValue(null);

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'non-existent',
        type: 'deposit',
        amount: 100,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });
  });

  describe('handleMessage - error handling', () => {
    it('should nack message on error', async () => {
      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from('invalid json'),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('should handle null message', async () => {
      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(null);

      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should nack on database error', async () => {
      (mockUserRepository.findOne as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const payload = {
        event: 'transaction.status_updated',
        transactionId: 'tx-1',
        receiverUserId: 'receiver-1',
        type: 'deposit',
        amount: 100,
        newStatus: 'completed',
      };

      const msg = {
        fields: { routingKey: 'transaction.status_updated' },
        content: Buffer.from(JSON.stringify(payload)),
      };

      const consumeCallback = mockChannel.consume.mock.calls[0][1];
      await consumeCallback(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });
  });
});