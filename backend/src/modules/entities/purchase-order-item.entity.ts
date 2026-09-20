import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { numericTransformer } from '../../common/numeric.transformer';
import { Batch } from './batch.entity';
import { Medicine } from './medicine.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('purchase_order_items')
export class PurchaseOrderItem extends BaseEntity {
  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder;

  @Column({ name: 'purchase_order_id' })
  purchaseOrderId: number;

  @ManyToOne(() => Medicine, (medicine) => medicine.purchaseOrderItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medicine_id' })
  medicine: Medicine;

  @Column({ name: 'medicine_id' })
  medicineId: number;

  /** Filled in when the goods are actually received into a batch. */
  @ManyToOne(() => Batch, (batch) => batch.purchaseOrderItems, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'batch_id' })
  batch?: Batch | null;

  @Column({ type: 'int', name: 'batch_id', nullable: true })
  batchId?: number | null;

  @Column({ type: 'varchar', name: 'batch_number', length: 64, nullable: true })
  batchNumber?: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'received_quantity', type: 'int', default: 0 })
  receivedQuantity: number;

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  unitCost: number;

  @Column({
    name: 'line_total',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  lineTotal: number;
}
