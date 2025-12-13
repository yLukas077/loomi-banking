import { RabbitMQPublisher } from './rabbitmq/rabbitmq.publisher'
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'


@Module({
  imports: [DatabaseModule, UsersModule, RedisModule],
  providers: [RabbitMQPublisher],
  exports: [RabbitMQPublisher],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
