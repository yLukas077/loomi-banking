import { ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator'

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Lucas Silva' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Za-zÀ-ÿ\s']+$/, {
    message: 'Nome deve conter apenas letras e espaços',
  })
  name?: string

  @ApiPropertyOptional({ example: 'lucas.silva@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'Rua Nova, 321' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  address?: string
}
