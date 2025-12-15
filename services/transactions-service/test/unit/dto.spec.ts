import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTransactionDto } from '../../src/transactions/dto/create-transaction.dto';
import { UpdateTransactionStatusDto } from '../../src/transactions/dto/update-status.dto';
import { TransactionType, TransactionStatus } from '../../src/transactions/entities/transaction.entity';

describe('CreateTransactionDto', () => {
  it('should validate a valid deposit transaction', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.DEPOSIT,
      amount: 100.50,
      description: 'Test deposit',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid withdraw transaction', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.WITHDRAW,
      amount: 50,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate a valid transfer transaction', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.TRANSFER,
      amount: 200,
      description: 'Transfer to savings',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation for invalid UUID', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'invalid-uuid',
      type: TransactionType.DEPOSIT,
      amount: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('userId');
  });

  it('should fail validation for missing userId', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      type: TransactionType.DEPOSIT,
      amount: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation for invalid transaction type', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: 'invalid_type',
      amount: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
  });

  it('should fail validation for negative amount', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.DEPOSIT,
      amount: -100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('amount');
  });

  it('should fail validation for zero amount', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.DEPOSIT,
      amount: 0,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation for non-numeric amount', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.DEPOSIT,
      amount: 'abc',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow optional description', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      userId: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
      type: TransactionType.DEPOSIT,
      amount: 100,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.description).toBeUndefined();
  });
});

describe('UpdateTransactionStatusDto', () => {
  it('should validate COMPLETED status', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {
      status: TransactionStatus.COMPLETED,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate PENDING status', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {
      status: TransactionStatus.PENDING,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate FAILED status', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {
      status: TransactionStatus.FAILED,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation for invalid status', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {
      status: 'invalid_status',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('status');
  });

  it('should fail validation for missing status', async () => {
    const dto = plainToInstance(UpdateTransactionStatusDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
