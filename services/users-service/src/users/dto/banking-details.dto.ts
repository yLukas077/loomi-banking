import {
  IsString,
  Length,
  Matches,
  IsIn,
} from 'class-validator'

export class BankingDetailsDto {
  @IsString()
  @Length(3, 4)
  @Matches(/^[0-9]+$/, {
    message: 'Agência deve conter apenas números',
  })
  agency: string

  @IsString()
  @Length(6, 10)
  @Matches(/^[0-9]+$/, {
    message: 'Número da conta deve conter apenas números',
  })
  accountNumber: string

  @IsIn(['checking', 'savings'], {
    message: 'Tipo de conta deve ser checking ou savings',
  })
  accountType: string
}
