import { Module } from '@nestjs/common';
import { RabbitMQPublisher } from './rabbitmq/rabbitmq.publisher'
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [DatabaseModule, UsersModule, RedisModule],
  providers: [RabbitMQPublisher],
  exports: [RabbitMQPublisher],
})
export class AppModule {}
