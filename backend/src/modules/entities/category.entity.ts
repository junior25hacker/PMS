import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { Medicine } from './medicine.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Medicine, (medicine) => medicine.category)
  medicines: Medicine[];
}
