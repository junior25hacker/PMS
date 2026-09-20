import { Exclude } from 'class-transformer';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';
import { UserRole } from '../../common/enums';
import { Sale } from './sale.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  fullName: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  email: string;

  /** bcrypt hash — never serialised to API responses. */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', enum: UserRole, default: UserRole.CASHIER })
  role: UserRole;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date | null;

  @OneToMany(() => Sale, (sale) => sale.cashier)
  sales: Sale[];
}
