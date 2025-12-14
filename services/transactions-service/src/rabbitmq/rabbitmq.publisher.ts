import { Injectable, OnModuleInit } from '@nestjs/common'
import amqp from 'amqplib'

@Injectable()
export class RabbitMQPublisher implements OnModuleInit {
  private channel: amqp.Channel

  async onModuleInit() {
    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    this.channel = await connection.createChannel()
  }

  async publish(routingKey: string, message: any) {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized')

    await this.channel.assertExchange('transactions', 'topic', { durable: true })

    this.channel.publish(
      'transactions',
      routingKey,
      Buffer.from(JSON.stringify(message)),
    )
  }
}
