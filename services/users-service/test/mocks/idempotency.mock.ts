export const idempotencyMock = {
  get: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
};
