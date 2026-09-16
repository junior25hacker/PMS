import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MedicineType } from '../../../common/enums';

export class CreateMedicineDto {
  @ApiProperty({ example: 'Paracetamol' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiProperty({ required: false, example: 'Acetaminophen' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  genericName?: string;

  @ApiProperty({ example: 'PCM-500-TAB' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku: string;

  @ApiProperty({ required: false, example: '5901234123457' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiProperty({ required: false, example: 'tablet', default: 'tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ required: false, example: 'tablet', default: 'tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  dosageForm?: string;

  @ApiProperty({ required: false, example: 'GSK' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @ApiProperty({ required: false, example: '500mg' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  strength?: string;

  @ApiProperty({ required: false, enum: MedicineType, default: MedicineType.OTC })
  @IsOptional()
  @IsEnum(MedicineType)
  type?: MedicineType;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiProperty({ required: false, example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @ApiProperty({ required: false, example: 0.12, default: 0.12 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  taxRate?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMedicineDto extends PartialType(CreateMedicineDto) {}

export class MedicineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Only return products at/below reorder level' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ description: 'Only return products with batches expiring within N days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expiringInDays?: number;

  @ApiPropertyOptional({ enum: MedicineType })
  @IsOptional()
  @IsEnum(MedicineType)
  type?: MedicineType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  isActive?: boolean;
}
