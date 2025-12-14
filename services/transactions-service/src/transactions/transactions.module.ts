import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Transaction } from './entities/transaction.entity'
import { TransactionsService } from './transactions.service'
import { TransactionsController } from './transactions.controller'
import { RedisModule } from 'src/redis/redis.module'
import { RabbitMQModule } from 'src/rabbitmq/rabbitmq.module'
import { TransactionsConsumer } from 'src/rabbitmq/transactions.consumer'


@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    RedisModule,
    RabbitMQModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsConsumer],
})
export class TransactionsModule {}