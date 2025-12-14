import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './transactions/transactions.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [DatabaseModule, TransactionsModule, RabbitMQModule, RedisModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
