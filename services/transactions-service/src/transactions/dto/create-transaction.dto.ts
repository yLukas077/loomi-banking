import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator'
import { TransactionType } from '../entities/transaction.entity'

export class CreateTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string

  @IsEnum(TransactionType)
  type: TransactionType

  @IsNumber()
  @IsPositive()
  amount: number

  @IsOptional()
  description?: string
}
