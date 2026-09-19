import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PrescriptionStatus } from '../../../common/enums';

export class PrescriptionItemDto {
  @ApiPropertyOptional({ example: 1, description: 'Optional ID of matched medicine in catalog' })
  @IsOptional()
  @IsInt()
  medicineId?: number;

  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  drugName: string;

  @ApiProperty({ example: '500mg' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  dosage: string;

  @ApiPropertyOptional({ example: '3 times daily after meals' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  frequency?: string;

  @ApiProperty({ example: '7 days' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  duration: string;

  @ApiProperty({ example: 21, minimum: 1 })
  @IsInt()
  @Min(1)
  quantityPrescribed: number;

  @ApiPropertyOptional({ example: 'Complete full course of antibiotics' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty({ example: 1, description: 'ID of the existing patient (required)' })
  @IsInt()
  @Min(1)
  patientId: number;

  @ApiProperty({ example: 'Dr. Sarah Jenkins, MD' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  doctorName: string;

  @ApiPropertyOptional({ example: 'MD-88341-TX' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  doctorLicense?: string;

  @ApiPropertyOptional({ example: 'City Central Hospital' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clinicHospital?: string;

  @ApiPropertyOptional({ example: 'Acute Bacterial Sinusitis' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  diagnosis?: string;

  @ApiProperty({ example: '2026-09-19', description: 'Issue date in YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'issueDate must be YYYY-MM-DD' })
  issueDate: string;

  @ApiPropertyOptional({ example: '2026-10-19', description: 'Expiry date in YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate must be YYYY-MM-DD' })
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'Patient advised to hydrate well' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A prescription must contain at least one medication item' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  @ApiPropertyOptional({
    description: 'Set to true when acknowledging and overriding an allergy warning',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeAllergyWarning?: boolean;

  @ApiPropertyOptional({
    description: 'Required if acknowledgeAllergyWarning is true',
    example: 'Patient tested negative on skin test / alternative considered and approved by doctor.',
  })
  @IsOptional()
  @IsString()
  allergyOverrideReason?: string;
}

export class CheckPrescriptionAllergiesDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  patientId: number;

  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}

export class PrescriptionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PrescriptionStatus })
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @ApiPropertyOptional({ description: 'Filter by patient ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patientId?: number;

  @ApiPropertyOptional({ description: 'Filter only prescriptions with allergy alerts' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allergyWarningOnly?: boolean;
}

export class UpdatePrescriptionStatusDto {
  @ApiProperty({ enum: PrescriptionStatus })
  @IsEnum(PrescriptionStatus)
  status: PrescriptionStatus;

  @ApiPropertyOptional({ example: 'Prescription fully dispensed to patient' })
  @IsOptional()
  @IsString()
  notes?: string;
}
