import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums';

export const ROLES_KEY = 'roles';

/**
 * Role Based Access Control.
 *
 * ```ts
 * @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
 * @Post()
 * create() { ... }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
