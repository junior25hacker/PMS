import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../common/enums';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'john@pharmly.io' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password123',
    description: 'At least 8 characters with at least one letter and one number.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password: string;

  @ApiProperty({ required: false, example: '+15551234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ enum: UserRole, required: false, example: UserRole.CASHIER })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role must be admin, pharmacist or cashier' })
  role?: UserRole;
}
