import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'MedSupply Distribution Ltd.' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name: string;

  @ApiProperty({ required: false, example: 'Daniel Okoye' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiProperty({ required: false, example: 'orders@medsupply.example' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  email?: string;

  @ApiProperty({ required: false, example: '+15550100' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ required: false, example: '18 Harbour Road, Warehouse District' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, example: 'VAT-99231' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @ApiProperty({ required: false, default: 'NET 30' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentTerms?: string;

  @ApiProperty({ required: false, example: 'Amoxicillin, Paracetamol, Ibuprofen, Azithromycin' })
  @IsOptional()
  @IsString()
  drugsSupplied?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
