import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { BankingDetails } from './entities/banking-details.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RabbitMQPublisher } from '../rabbitmq/rabbitmq.publisher'

@Module({
  imports: [TypeOrmModule.forFeature([User, BankingDetails])],
  controllers: [UsersController],
  providers: [UsersService, RabbitMQPublisher],
})
export class UsersModule {}