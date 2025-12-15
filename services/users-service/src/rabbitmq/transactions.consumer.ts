import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import amqp from 'amqplib'
import { User } from '../users/entities/user.entity'

interface TransactionCompletedEvent {
  event: string
  transactionId: string
  senderUserId?: string
  receiverUserId?: string
  type: 'deposit' | 'withdraw' | 'transfer'
  amount: number
  timestamp: string
}

@Injectable()
export class TransactionsConsumer implements OnModuleInit {
  private channel: amqp.Channel
  private readonly logger = new Logger(TransactionsConsumer.name)

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    this.channel = await connection.createChannel()

    await this.channel.assertExchange('transactions', 'topic', { durable: true })

    const queue = await this.channel.assertQueue('users_service_transactions_queue', {
      durable: true,
    })

    // Escuta eventos de transação completada
    await this.channel.bindQueue(queue.queue, 'transactions', 'transaction.status_updated')

    this.logger.log('TransactionsConsumer listening for transaction.status_updated events')

    this.channel.consume(
      queue.queue,
      (msg) => this.handleMessage(msg),
      { noAck: false },
    )
  }

  private async handleMessage(msg: amqp.ConsumeMessage | null) {
    if (!msg) return

    try {
      const payload = JSON.parse(msg.content.toString())
      const routingKey = msg.fields.routingKey

      this.logger.log({ event: routingKey, payload })

      if (routingKey === 'transaction.status_updated' && payload.newStatus === 'completed') {
        await this.handleTransactionCompleted(payload)
      }

      this.channel.ack(msg)
    } catch (err) {
      this.logger.error('Error consuming message', err)
      this.channel.nack(msg, false, false)
    }
  }

  private async handleTransactionCompleted(data: TransactionCompletedEvent) {
    const { type, amount, senderUserId, receiverUserId, transactionId } = data
    const numericAmount = Number(amount)

    this.logger.log({
      action: 'processing_transaction',
      transactionId,
      type,
      amount: numericAmount,
      senderUserId,
      receiverUserId,
    })

    switch (type) {
      case 'deposit':
        if (receiverUserId) {
          await this.updateBalance(receiverUserId, numericAmount)
        }
        break

      case 'withdraw':
        if (senderUserId) {
          await this.updateBalance(senderUserId, -numericAmount)
        }
        break

      case 'transfer':
        if (senderUserId) {
          await this.updateBalance(senderUserId, -numericAmount)
        }
        if (receiverUserId) {
          await this.updateBalance(receiverUserId, numericAmount)
        }
        break
    }
  }

  private async updateBalance(userId: string, amount: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } })

    if (!user) {
      this.logger.warn({ action: 'user_not_found', userId })
      return
    }

    const currentBalance = Number(user.balance) || 0
    user.balance = currentBalance + amount

    await this.usersRepo.save(user)

    this.logger.log({
      action: 'balance_updated',
      userId,
      previousBalance: currentBalance,
      change: amount,
      newBalance: user.balance,
    })
  }
}