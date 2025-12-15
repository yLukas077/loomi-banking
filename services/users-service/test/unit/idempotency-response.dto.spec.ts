import { IdempotencyResponseDto } from '../../src/users/dto/idempotency-response.dto';

describe('IdempotencyResponseDto', () => {
  it('should create an instance with success status', () => {
    const dto = new IdempotencyResponseDto();
    dto.status = 'success';
    dto.data = { id: '1', name: 'Test' };
    dto.createdAt = '2024-01-01T00:00:00Z';

    expect(dto.status).toBe('success');
    expect(dto.data).toEqual({ id: '1', name: 'Test' });
    expect(dto.createdAt).toBe('2024-01-01T00:00:00Z');
  });

  it('should create an instance with pending status', () => {
    const dto = new IdempotencyResponseDto();
    dto.status = 'pending';
    dto.data = null;
    dto.createdAt = '2024-01-01T00:00:00Z';

    expect(dto.status).toBe('pending');
    expect(dto.data).toBeNull();
  });

  it('should allow any type of data', () => {
    const dto = new IdempotencyResponseDto();
    dto.status = 'success';
    dto.createdAt = new Date().toISOString();

    // Test with object
    dto.data = { complex: { nested: 'value' } };
    expect(dto.data.complex.nested).toBe('value');

    // Test with array
    dto.data = [1, 2, 3];
    expect(dto.data).toHaveLength(3);

    // Test with string
    dto.data = 'simple string';
    expect(dto.data).toBe('simple string');
  });
});