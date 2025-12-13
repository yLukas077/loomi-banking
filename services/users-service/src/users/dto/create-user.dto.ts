import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator'

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Za-zÀ-ÿ\s']+$/, {
    message: 'Nome deve conter apenas letras e espaços',
  })
  name: string

  @IsEmail()
  email: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  address?: string
}
