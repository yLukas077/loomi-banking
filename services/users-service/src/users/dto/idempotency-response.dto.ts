export class IdempotencyResponseDto {
  status: 'success' | 'pending';
  data: any;
  createdAt: string;
}
