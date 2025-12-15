import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, ValidateIf } from 'class-validator'
import { TransactionType } from '../entities/transaction.entity'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateTransactionDto {
  @ApiPropertyOptional({
    description: 'ID of the user sending the funds (required for withdraw and transfer)',
    example: 'e1120ea7-83cf-42c2-b358-63b8637509c7',
  })
  @ValidateIf((o) => o.type === TransactionType.WITHDRAW || o.type === TransactionType.TRANSFER)
  @IsUUID()
  @IsNotEmpty()
  senderUserId?: string

  @ApiPropertyOptional({
    description: 'ID of the user receiving the funds (required for deposit and transfer)',
    example: 'f2230fb8-94df-53d3-c469-74c9748610d8',
  })
  @ValidateIf((o) => o.type === TransactionType.DEPOSIT || o.type === TransactionType.TRANSFER)
  @IsUUID()
  @IsNotEmpty()
  receiverUserId?: string

  @ApiProperty({
    description: 'Type of the transaction',
    enum: TransactionType,
    example: TransactionType.TRANSFER,
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
    example: 'PIX transfer',
  })
  @IsOptional()
  description?: string
}