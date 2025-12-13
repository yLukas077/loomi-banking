import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [DatabaseModule, TransactionsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
