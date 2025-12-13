import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { BankingDetails } from './entities/banking-details.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, BankingDetails])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
