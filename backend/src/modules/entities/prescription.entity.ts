import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { PrescriptionStatus } from '../../common/enums';
import { Patient } from './patient.entity';
import { PrescriptionItem } from './prescription-item.entity';
import { User } from './user.entity';

@Entity('prescriptions')
export class Prescription extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'prescription_number', length: 64 })
  prescriptionNumber: string;

  @Index()
  @Column({ name: 'patient_id', type: 'int' })
  patientId: number;

  @ManyToOne(() => Patient, (patient) => patient.prescriptions, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'doctor_name', length: 140 })
  doctorName: string;

  @Column({ name: 'doctor_license', length: 80, nullable: true })
  doctorLicense?: string | null;

  @Column({ name: 'clinic_hospital', length: 160, nullable: true })
  clinicHospital?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  diagnosis?: string | null;

  @Column({ name: 'issue_date', type: 'varchar', length: 10 })
  issueDate: string;

  @Column({ name: 'expiry_date', type: 'varchar', length: 10, nullable: true })
  expiryDate?: string | null;

  @Column({
    type: 'enum',
    enum: PrescriptionStatus,
    default: PrescriptionStatus.PENDING,
  })
  status: PrescriptionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** Allergy interaction safety & logging */
  @Column({ name: 'allergy_warning_triggered', type: 'boolean', default: false })
  allergyWarningTriggered: boolean;

  @Column({ name: 'allergy_conflict_details', type: 'text', nullable: true })
  allergyConflictDetails?: string | null;

  @Column({ name: 'allergy_override_acknowledged', type: 'boolean', default: false })
  allergyOverrideAcknowledged: boolean;

  @Column({ name: 'allergy_override_reason', type: 'text', nullable: true })
  allergyOverrideReason?: string | null;

  @Column({ name: 'allergy_override_by', type: 'varchar', length: 140, nullable: true })
  allergyOverrideBy?: string | null;

  @Column({ name: 'allergy_override_at', type: 'timestamptz', nullable: true })
  allergyOverrideAt?: Date | null;

  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  createdById?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @OneToMany(() => PrescriptionItem, (item) => item.prescription, {
    cascade: true,
  })
  items: PrescriptionItem[];
}
