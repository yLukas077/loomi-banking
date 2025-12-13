import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length, Matches, IsIn } from 'class-validator'

export class BankingDetailsDto {
  @ApiProperty({ example: '237' })
  @IsString()
  @Length(3, 4)
  @Matches(/^[0-9]+$/, {
    message: 'Agência deve conter apenas números',
  })
  agency: string

  @ApiProperty({ example: '00099922' })
  @IsString()
  @Length(6, 10)
  @Matches(/^[0-9]+$/, {
    message: 'Número da conta deve conter apenas números',
  })
  accountNumber: string

  @ApiProperty({ example: 'checking', enum: ['checking', 'savings'] })
  @IsIn(['checking', 'savings'], {
    message: 'Tipo de conta deve ser checking ou savings',
  })
  accountType: string
}
