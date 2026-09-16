import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../enums';

/** Shape attached to `request.user` by {@link JwtAuthGuard}. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: UserRole;
  fullName: string;
}

/**
 * Injects the authenticated user (or one of its properties) into a handler.
 *
 * ```ts
 * findAll(@CurrentUser() user: AuthenticatedUser) {}
 * findAll(@CurrentUser('id') userId: number) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
