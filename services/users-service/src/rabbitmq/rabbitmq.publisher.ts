import { Injectable, OnModuleInit } from '@nestjs/common'
import * as amqp from 'amqplib'

@Injectable()
export class RabbitMQPublisher implements OnModuleInit {
  private connection: amqp.Connection
  private channel: amqp.Channel
  private exchange = 'users.events'

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL

    this.connection = await amqp.connect(url)
    this.channel = await this.connection.createChannel()
    
    await this.channel.assertQueue('transactions_service_queue', { durable: true })
    await this.channel.bindQueue('transactions_service_queue', 'users.events', '#')

    await this.channel.assertExchange(this.exchange, 'topic', { durable: true })

    console.log('[RabbitMQ] Connected and exchange ready:', this.exchange)
  }

  async publish(event: string, payload: any) {
    const message = Buffer.from(JSON.stringify(payload))

    this.channel.publish(this.exchange, event, message)

    console.log(`[RabbitMQ] Published event: ${event}`)
  }
}
