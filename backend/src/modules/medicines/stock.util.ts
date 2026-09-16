import { MedicineType } from '../../common/enums';
import type { StockedMedicine } from './dto/stock.dto';

/** Raw shape returned by the stock aggregation query. */
export interface StockAggregateRow {
  medicineId: string | number;
  totalStock: string | number;
  nearestExpiry: string | null;
  sellingPrice: string | number | null;
  unitCost: string | number | null;
}

/**
 * Correlated sub-select computing live stock for a medicine.
 * Kept in one place so inventory, POS and dashboard all agree on the number.
 */
export const TOTAL_STOCK_SUBQUERY = `COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id = medicine.id), 0)`;

export const NEAREST_EXPIRY_SUBQUERY = `(SELECT MIN(b.expiry_date) FROM batches b WHERE b.medicine_id = medicine.id AND b.quantity > 0)`;

export const SELLING_PRICE_SUBQUERY = `(SELECT MAX(b.selling_price) FROM batches b WHERE b.medicine_id = medicine.id AND b.quantity > 0)`;

export function classifyStock(
  totalStock: number,
  reorderLevel: number,
): StockedMedicine['stockStatus'] {
  if (totalStock <= 0) return 'out_of_stock';
  if (totalStock <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

export function isExpiringSoon(
  nearestExpiry: string | null,
  withinDays: number,
): boolean {
  if (!nearestExpiry) return false;
  const expiry = new Date(nearestExpiry).getTime();
  const threshold = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  return expiry <= threshold;
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

export function mapMedicineRow(
  medicine: Record<string, unknown>,
  stock: StockAggregateRow | undefined,
  expiringWindowDays: number,
): StockedMedicine {
  const totalStock = toNumber(stock?.totalStock);
  const nearestExpiry = stock?.nearestExpiry
    ? new Date(stock.nearestExpiry).toISOString().slice(0, 10)
    : null;
  const reorderLevel = Number(medicine.reorderLevel ?? 0);
  const category = medicine.category as { id: number; name: string } | null | undefined;

  return {
    id: Number(medicine.id),
    name: String(medicine.name),
    genericName: (medicine.genericName as string | null) ?? null,
    sku: String(medicine.sku),
    barcode: (medicine.barcode as string | null) ?? null,
    dosageForm: String(medicine.dosageForm ?? 'tablet'),
    strength: (medicine.strength as string | null) ?? null,
    unit: String(medicine.unit ?? 'unit'),
    manufacturer: (medicine.manufacturer as string | null) ?? null,
    type: (medicine.type as MedicineType) ?? MedicineType.OTC,
    categoryId: category?.id ?? (medicine.categoryId as number | null) ?? null,
    categoryName: category?.name ?? null,
    reorderLevel,
    taxRate: toNumber(medicine.taxRate as string | number),
    isActive: Boolean(medicine.isActive),
    totalStock,
    nearestExpiry,
    sellingPrice: stock?.sellingPrice !== null && stock?.sellingPrice !== undefined
      ? toNumber(stock.sellingPrice)
      : null,
    unitCost: stock?.unitCost !== null && stock?.unitCost !== undefined
      ? toNumber(stock.unitCost)
      : null,
    stockStatus: classifyStock(totalStock, reorderLevel),
    isExpiringSoon: isExpiringSoon(nearestExpiry, expiringWindowDays),
  };
}
