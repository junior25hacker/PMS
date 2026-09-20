import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Prescription } from './prescription.entity';

@Entity('patients')
@Index(['name', 'dateOfBirth'])
export class Patient extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 140 })
  name: string;

  @Column({ name: 'date_of_birth', type: 'varchar', length: 10 })
  dateOfBirth: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  /** Comma-separated list or description of known drug & food allergies */
  @Column({ type: 'text', name: 'known_allergies', nullable: true })
  knownAllergies?: string | null;

  @Column({ type: 'varchar', name: 'emergency_contact', length: 140, nullable: true })
  emergencyContact?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Prescription, (rx) => rx.patient)
  prescriptions: Prescription[];
}
