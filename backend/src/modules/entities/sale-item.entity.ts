import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { numericTransformer } from '../../common/numeric.transformer';
import { Batch } from './batch.entity';
import { Medicine } from './medicine.entity';
import { Sale } from './sale.entity';

@Entity('sale_items')
export class SaleItem extends BaseEntity {
  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'sale_id' })
  saleId: number;

  @ManyToOne(() => Medicine, (medicine) => medicine.saleItems, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'medicine_id' })
  medicine: Medicine;

  @Column({ name: 'medicine_id' })
  medicineId: number;

  /** The exact batch consumed — required for traceability / recalls. */
  @ManyToOne(() => Batch, (batch) => batch.saleItems, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'batch_id' })
  batch?: Batch | null;

  @Column({ type: 'int', name: 'batch_id', nullable: true })
  batchId?: number | null;

  @Column({ name: 'medicine_name', length: 160 })
  medicineName: string;

  @Column({ type: 'varchar', name: 'batch_number', length: 64, nullable: true })
  batchNumber?: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({
    name: 'tax_rate',
    type: 'numeric',
    precision: 5,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  taxRate: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  lineTotal: number;
}
