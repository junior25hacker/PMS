import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timestampType } from './db.util';

/**
 * Base entity providing a numeric identity plus audit timestamps for every
 * persisted aggregate in the system.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at', type: timestampType() })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: timestampType() })
  updatedAt: Date;
}
