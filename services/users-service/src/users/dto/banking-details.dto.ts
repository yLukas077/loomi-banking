import { IsNotEmpty, IsString, IsIn } from 'class-validator'

export class BankingDetailsDto {
  @IsNotEmpty()
  @IsString()
  agency: string

  @IsNotEmpty()
  @IsString()
  accountNumber: string

  @IsIn(['checking', 'savings'])
  accountType: string
}
