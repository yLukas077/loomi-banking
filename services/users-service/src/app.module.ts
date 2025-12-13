import { RabbitMQPublisher } from './rabbitmq/rabbitmq.publisher';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { IdempotencyModule } from './common/idempotency/idempotency.module';

@Module({
  imports: [DatabaseModule, UsersModule, RedisModule, IdempotencyModule],
  providers: [RabbitMQPublisher, IdempotencyService],
  exports: [RabbitMQPublisher],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
