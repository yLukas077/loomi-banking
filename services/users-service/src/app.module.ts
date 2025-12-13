import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RabbitMQPublisher } from './rabbitmq/rabbitmq.publisher'
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [AppController],
  providers: [RabbitMQPublisher],
  exports: [RabbitMQPublisher],
})
export class AppModule {}
