import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Medicine } from './medicine.entity';
import { Prescription } from './prescription.entity';

@Entity('prescription_items')
export class PrescriptionItem extends BaseEntity {
  @ManyToOne(() => Prescription, (rx) => rx.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;

  @Column({ name: 'prescription_id', type: 'int' })
  prescriptionId: number;

  @ManyToOne(() => Medicine, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'medicine_id' })
  medicine?: Medicine | null;

  @Column({ name: 'medicine_id', type: 'int', nullable: true })
  medicineId?: number | null;

  @Column({ name: 'drug_name', type: 'varchar', length: 160 })
  drugName: string;

  @Column({ type: 'varchar', length: 80 })
  dosage: string;

  @Column({ type: 'varchar', length: 80, default: 'Once daily' })
  frequency: string;

  @Column({ type: 'varchar', length: 80 })
  duration: string;

  @Column({ name: 'quantity_prescribed', type: 'int', default: 1 })
  quantityPrescribed: number;

  @Column({ type: 'text', nullable: true })
  instructions?: string | null;

  @Column({ name: 'has_allergy_conflict', type: 'boolean', default: false })
  hasAllergyConflict: boolean;

  @Column({ name: 'allergy_conflict_details', type: 'text', nullable: true })
  allergyConflictDetails?: string | null;
}
