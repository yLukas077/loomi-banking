import { IsEnum } from 'class-validator'
import { TransactionStatus } from '../entities/transaction.entity'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateTransactionStatusDto {
  @ApiProperty({
    description: 'New status of the transaction',
    enum: TransactionStatus,
    example: TransactionStatus.COMPLETED,
  })
  @IsEnum(TransactionStatus)
  status: TransactionStatus
}
