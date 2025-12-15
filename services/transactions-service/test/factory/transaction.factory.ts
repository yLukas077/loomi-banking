import { faker } from '@faker-js/faker';
import { TransactionType, TransactionStatus } from '../../src/transactions/entities/transaction.entity';

export function transactionFactory(overrides: Partial<{
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
}> = {}) {
  return {
    userId: faker.string.uuid(),
    type: faker.helpers.arrayElement([TransactionType.DEPOSIT, TransactionType.WITHDRAW, TransactionType.TRANSFER]),
    amount: parseFloat(faker.finance.amount({ min: 10, max: 1000 })),
    description: faker.finance.transactionDescription(),
    ...overrides,
  };
}

export function createTransactionDto(overrides: Partial<{
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
}> = {}) {
  return {
    userId: faker.string.uuid(),
    type: TransactionType.DEPOSIT,
    amount: parseFloat(faker.finance.amount({ min: 10, max: 1000 })),
    ...overrides,
  };
}
