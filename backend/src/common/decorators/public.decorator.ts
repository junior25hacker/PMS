import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route or controller as reachable without a JWT.
 * Used for `/auth/login`, `/auth/refresh` and the health probe.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
