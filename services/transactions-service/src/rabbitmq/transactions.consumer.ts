import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import amqp from 'amqplib'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class TransactionsConsumer implements OnModuleInit {
  private channel: amqp.Channel
  private readonly logger = new Logger(TransactionsConsumer.name)

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    this.channel = await connection.createChannel()

    await this.channel.assertExchange('users.events', 'topic', { durable: true })

    const queue = await this.channel.assertQueue('transactions_service_queue', {
      durable: true,
    })

    await this.channel.bindQueue(queue.queue, 'users.events', '#')

    this.logger.log('TransactionsConsumer listening for users.* events')

    this.channel.consume(
      queue.queue,
      (msg) => this.handleMessage(msg),
      { noAck: false },
    )
  }

  private async handleMessage(msg: amqp.ConsumeMessage | null) {
    if (!msg) return

    try {
      const routingKey = msg.fields.routingKey
      const payload = JSON.parse(msg.content.toString())

      this.logger.log({
        event: routingKey,
        payload,
      })

      switch (routingKey) {
        case 'user.created':
          await this.handleUserCreated(payload)
          break
        case 'banking_details.updated':
          await this.handleBankingDetailsUpdated(payload)
          break
      }

      this.channel.ack(msg)
    } catch (err) {
      this.logger.error('Error consuming message', err)
      this.channel.nack(msg, false, false)
    }
  }

  private async handleUserCreated(data: any) {
    await this.redis.set(`user:${data.userId}`, {
      id: data.userId,
      name: data.name,
      email: data.email,
    }, 86400)

    this.logger.log({
      action: 'cached_user',
      userId: data.userId,
    })
  }

  private async handleBankingDetailsUpdated(data: any) {
    await this.redis.set(`user:${data.userId}:banking`, data.details, 86400)

    this.logger.log({
      action: 'cached_banking_details',
      userId: data.userId,
    })
  }
}