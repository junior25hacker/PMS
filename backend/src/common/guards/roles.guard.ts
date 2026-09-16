import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums';

/**
 * Enforces `@Roles(...)` metadata. Runs after {@link JwtAuthGuard} so
 * `request.user` is always populated by the time we get here.
 *
 * RBAC matrix used by this application:
 *  - admin      → full access (users, suppliers, purchases, everything)
 *  - pharmacist → inventory, batches, suppliers, purchases, dashboard
 *  - cashier    → POS / sales and read-only catalog lookups
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role "${user.role}" is not allowed to perform this action`,
      );
    }

    return true;
  }
}
