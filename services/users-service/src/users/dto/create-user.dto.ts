import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ example: 'Lucas Almeida' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Za-zÀ-ÿ\s']+$/, {
    message: 'Nome deve conter apenas letras e espaços',
  })
  name: string

  @ApiProperty({ example: 'lucas@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'Av. Brasil, 123', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  address?: string
}
