import { ApiProperty } from '@nestjs/swagger';
import { MedicineType } from '../../../common/enums';

/** A medicine decorated with its aggregated, sellable stock position. */
export interface StockedMedicine {
  id: number;
  name: string;
  genericName: string | null;
  sku: string;
  barcode: string | null;
  dosageForm: string;
  strength: string | null;
  unit: string;
  manufacturer: string | null;
  type: MedicineType;
  categoryId: number | null;
  categoryName: string | null;
  reorderLevel: number;
  taxRate: number;
  isActive: boolean;
  totalStock: number;
  nearestExpiry: string | null;
  sellingPrice: number | null;
  unitCost: number | null;
  stockStatus: 'out_of_stock' | 'low_stock' | 'in_stock';
  isExpiringSoon: boolean;
}

export class StockLevelDto {
  @ApiProperty({ example: 1256 })
  totalStock: number;

  @ApiProperty({ example: 42, description: 'Distinct sellable products' })
  productCount: number;

  @ApiProperty({ example: 8750.55 })
  inventoryValue: number;

  @ApiProperty({ example: 6 })
  lowStockCount: number;

  @ApiProperty({ example: 3 })
  outOfStockCount: number;

  @ApiProperty({ example: 4 })
  expiringSoonCount: number;
}
