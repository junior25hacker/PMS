import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { PaymentMethod, SaleStatus } from '../../common/enums';
import { numericTransformer } from '../../common/numeric.transformer';
import { SaleItem } from './sale-item.entity';
import { User } from './user.entity';

@Entity('sales')
export class Sale extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'invoice_number', length: 40 })
  invoiceNumber: string;

  @ManyToOne(() => User, (user) => user.sales, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cashier_id' })
  cashier?: User | null;

  @Column({ type: 'int', name: 'cashier_id', nullable: true })
  cashierId?: number | null;

  /** Optional walk-in customer details for the receipt. */
  @Column({ type: 'varchar', name: 'customer_name', length: 140, nullable: true })
  customerName?: string | null;

  @Column({ type: 'varchar', name: 'customer_phone', length: 32, nullable: true })
  customerPhone?: string | null;

  @Column({ type: 'varchar', name: 'customer_email', length: 160, nullable: true })
  customerEmail?: string | null;

  @Column({
    name: 'subtotal',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  subtotal: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountAmount: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  taxAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
  })
  paymentMethod: PaymentMethod;

  @Column({
    name: 'amount_paid',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  amountPaid: number;

  @Column({
    name: 'change_due',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  changeDue: number;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  status: SaleStatus;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items: SaleItem[];
}
