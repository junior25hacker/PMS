import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateBatchDto {
  @ApiProperty({ example: 1, description: 'Medicine id this batch belongs to' })
  @IsInt()
  @IsPositive()
  medicineId: number;

  @ApiProperty({ example: 'BATCH-2026-014' })
  @IsString()
  @MaxLength(64)
  batchNumber: string;

  @ApiProperty({ example: '2026-01-15', description: 'ISO date' })
  @IsDateString({}, { message: 'manufacturingDate must be a valid ISO date' })
  manufacturingDate: string;

  @ApiProperty({ example: '2028-01-15', description: 'ISO date' })
  @IsDateString({}, { message: 'expiryDate must be a valid ISO date' })
  expiryDate: string;

  @ApiProperty({ example: 200 })
  @IsInt()
  @Min(1, { message: 'quantity must be greater than zero' })
  quantity: number;

  @ApiProperty({ example: 3.4, description: 'Purchase cost per unit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;

  @ApiProperty({ example: 5.5, description: 'Retail price per unit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({ example: 'Shelf A-3' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  storageLocation?: string;
}

export class UpdateBatchDto extends PartialType(CreateBatchDto) {}

export class AdjustStockDto {
  @ApiProperty({
    example: -5,
    description: 'Signed delta. Negative values reduce stock (damage, wastage).',
  })
  @IsInt()
  delta: number;

  @ApiPropertyOptional({ example: 'Damaged during transport' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class BatchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medicineId?: number;

  @ApiPropertyOptional({ description: 'Only batches expiring within N days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  expiringInDays?: number;

  @ApiPropertyOptional({ description: 'Only batches with stock remaining' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  inStockOnly?: boolean;
}
