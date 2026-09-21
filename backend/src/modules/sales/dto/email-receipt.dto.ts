import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class EmailReceiptDto {
  @ApiPropertyOptional({
    example: 'customer@example.com',
    description: 'Optional override when the sale has no stored customer email.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}