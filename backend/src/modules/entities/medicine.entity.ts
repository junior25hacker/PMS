import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { MedicineType } from '../../common/enums';
import { numericTransformer } from '../../common/numeric.transformer';
import { Batch } from './batch.entity';
import { Category } from './category.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { SaleItem } from './sale-item.entity';

/**
 * A sellable product (the "SKU"). Physical stock lives on {@link Batch}
 * records so we can track expiry, cost basis and supplier per delivery.
 */
@Entity('medicines')
export class Medicine extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', name: 'generic_name', length: 160, nullable: true })
  genericName?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  sku: string;

  /** EAN/UPC code used by the POS barcode input. */
  @Index()
  @Column({ type: 'varchar', name: 'barcode', length: 64, nullable: true })
  barcode?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unit' })
  unit: string;

  /** Dosage form: tablet, syrup, capsule, injection ... */
  @Column({ name: 'dosage_form', type: 'varchar', length: 60, default: 'tablet' })
  dosageForm: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  manufacturer?: string | null;

  @Column({ type: 'varchar', name: 'strength', length: 60, nullable: true })
  strength?: string | null;

  @Column({ type: 'varchar', enum: MedicineType, default: MedicineType.OTC })
  type: MedicineType;

  @ManyToOne(() => Category, (category) => category.medicines, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @Column({ type: 'int', name: 'category_id', nullable: true })
  categoryId?: number | null;

  /** Reorder point: total stock at or below this value raises an alert. */
  @Column({ name: 'reorder_level', type: 'int', default: 20 })
  reorderLevel: number;

  /** Default tax rate applied at the POS, e.g. 0.12 for 12%. */
  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0.12,
    transformer: numericTransformer,
  })
  taxRate: number;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Virtual/derived: aggregated on read, not persisted. */
  totalStock?: number;
  nearestExpiry?: string | null;

  @OneToMany(() => Batch, (batch) => batch.medicine)
  batches: Batch[];

  @OneToMany(() => SaleItem, (item) => item.medicine)
  saleItems: SaleItem[];

  @OneToMany(() => PurchaseOrderItem, (item) => item.medicine)
  purchaseOrderItems: PurchaseOrderItem[];
}
