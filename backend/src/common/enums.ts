/**
 * Shared enums used across entities, DTOs and business rules.
 */

export enum UserRole {
  ADMIN = 'admin',
  PHARMACIST = 'pharmacist',
  CASHIER = 'cashier',
}

export enum SaleStatus {
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  VOID = 'void',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  MOBILE = 'mobile',
  INSURANCE = 'insurance',
}

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  ORDERED = 'ordered',
  PARTIALLY_RECEIVED = 'partially_received',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum StockMovementType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  ADJUSTMENT = 'adjustment',
  RETURN = 'return',
  DISPOSAL = 'disposal',
}

/** Prescription-only vs over-the-counter classification. */
export enum MedicineType {
  OTC = 'otc',
  PRESCRIPTION = 'prescription',
  CONTROLLED = 'controlled',
}
