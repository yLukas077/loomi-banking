import { IsEnum } from 'class-validator'
import { TransactionStatus } from '../entities/transaction.entity'

export class UpdateTransactionStatusDto {
  @IsEnum(TransactionStatus)
  status: TransactionStatus
}
