import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Batch } from './batch.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ length: 140 })
  name: string;

  @Column({ type: 'varchar', name: 'contact_person', length: 120, nullable: true })
  contactPerson?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Index()
  @Column({ type: 'varchar', name: 'tax_id', length: 60, nullable: true })
  taxId?: string | null;

  @Column({ name: 'payment_terms', length: 60, default: 'NET 30' })
  paymentTerms: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => PurchaseOrder, (po) => po.supplier)
  purchaseOrders: PurchaseOrder[];

  @OneToMany(() => Batch, (batch) => batch.supplier)
  batches: Batch[];
}
