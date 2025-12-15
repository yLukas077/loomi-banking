import { faker } from '@faker-js/faker';

export const userFactory = (overrides = {}) => ({
  name: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  address: faker.location.streetAddress(),
  ...overrides,
});
