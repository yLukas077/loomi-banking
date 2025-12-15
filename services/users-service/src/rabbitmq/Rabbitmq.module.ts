import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RabbitMQPublisher } from './rabbitmq.publisher'
import { TransactionsConsumer } from './transactions.consumer'
import { User } from '../users/entities/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [RabbitMQPublisher, TransactionsConsumer],
  exports: [RabbitMQPublisher],
})
export class RabbitMQModule {}