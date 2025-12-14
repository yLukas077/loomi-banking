import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator'
import { TransactionType } from '../entities/transaction.entity'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTransactionDto {
  @ApiProperty({
    description: 'ID of the user performing the transaction',
    example: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string

  @ApiProperty({
    description: 'Type of the transaction',
    enum: TransactionType,
    example: TransactionType.DEPOSIT,
  })
  @IsEnum(TransactionType)
  type: TransactionType

  @ApiProperty({
    description: 'Transaction amount',
    example: 150.5,
  })
  @IsNumber()
  @IsPositive()
  amount: number

  @ApiPropertyOptional({
    description: 'Optional transaction description',
    example: 'PIX deposit',
  })
  @IsOptional()
  description?: string
}
