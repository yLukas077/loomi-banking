import { faker } from '@faker-js/faker';

export function bankingFactory(overrides: Partial<{
  agency: string;
  accountNumber: string;
  accountType: string;
}> = {}) {
  return {
    agency: faker.string.numeric({ length: 3 }),
    accountNumber: faker.string.numeric({ length: 8 }),
    accountType: faker.helpers.arrayElement(['checking', 'savings']),
    ...overrides,
  };
}