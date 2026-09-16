import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { numericTransformer } from '../../common/numeric.transformer';
import { Medicine } from './medicine.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { SaleItem } from './sale-item.entity';
import { Supplier } from './supplier.entity';

/**
 * A physical delivery of a medicine. Stock, cost and expiry are tracked per
 * batch so that POS sales can consume inventory with a FEFO policy
 * (First-Expiry-First-Out).
 */
@Entity('batches')
@Index(['medicineId', 'expiryDate'])
export class Batch extends BaseEntity {
  @Column({ name: 'batch_number', length: 64 })
  batchNumber: string;

  @ManyToOne(() => Medicine, (medicine) => medicine.batches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'medicine_id' })
  medicine: Medicine;

  @Column({ name: 'medicine_id' })
  medicineId: number;

  @ManyToOne(() => Supplier, (supplier) => supplier.batches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: Supplier | null;

  @Column({ type: 'int', name: 'supplier_id', nullable: true })
  supplierId?: number | null;

  @Column({ name: 'manufacturing_date', type: 'date' })
  manufacturingDate: string;

  @Column({ name: 'expiry_date', type: 'date' })
  expiryDate: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  /** Quantity originally received — used for wastage / movement reports. */
  @Column({ name: 'initial_quantity', type: 'int', default: 0 })
  initialQuantity: number;

  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  unitCost: number;

  @Column({
    name: 'selling_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  sellingPrice: number;

  @Column({ type: 'varchar', name: 'storage_location', length: 60, nullable: true })
  storageLocation?: string | null;

  @OneToMany(() => SaleItem, (item) => item.batch)
  saleItems: SaleItem[];

  @OneToMany(() => PurchaseOrderItem, (item) => item.batch)
  purchaseOrderItems: PurchaseOrderItem[];
}
