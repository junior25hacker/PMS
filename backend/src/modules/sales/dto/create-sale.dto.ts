import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums';

export class SaleItemInputDto {
  @ApiProperty({ example: 12, description: 'Medicine id' })
  @IsInt()
  medicineId: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1, { message: 'quantity must be at least 1' })
  quantity: number;

  @ApiPropertyOptional({
    example: 5.5,
    description:
      'Override price (discounted line). Defaults to the FEFO batch selling price.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;
}

export class CreateSaleDto {
  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A sale must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'John Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  customerName?: string;

  @ApiPropertyOptional({ example: '+15550123' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhone?: string;

  @ApiPropertyOptional({
    example: 2.5,
    description: 'Absolute discount amount (not a percentage) applied to the sale.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Amount tendered by the customer (used to compute change).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPaid?: number;
}
