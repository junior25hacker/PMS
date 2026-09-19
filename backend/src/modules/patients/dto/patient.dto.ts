import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Johnathan Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name: string;

  @ApiProperty({ example: '1990-05-14', description: 'Date of birth in YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateOfBirth must be in YYYY-MM-DD format',
  })
  dateOfBirth: string;

  @ApiProperty({ required: false, example: 'male' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiProperty({ required: false, example: '+15551234' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ required: false, example: 'john.doe@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  email?: string;

  @ApiProperty({ required: false, example: '123 Health Ave, Springfield' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    required: false,
    example: 'Penicillin, Aspirin, Sulfa drugs',
    description: 'Comma-separated list of known drug and substance allergies',
  })
  @IsOptional()
  @IsString()
  knownAllergies?: string;

  @ApiProperty({ required: false, example: 'Jane Doe (+15555678)' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  emergencyContact?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
