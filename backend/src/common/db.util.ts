import { Repository } from 'typeorm';

/**
 * Returns 'LIKE' for SQLite (where LIKE is case-insensitive for ASCII and ILIKE does not exist)
 * and 'ILIKE' for PostgreSQL (where LIKE is case-sensitive).
 * If repo is undefined or not connected to SQLite (e.g. PostgreSQL or in unit test mocks),
 * defaults to 'ILIKE'.
 */
export function ilikeOp(repo?: Repository<any>): string {
  return repo?.manager?.connection?.options?.type === 'sqlite' ? 'LIKE' : 'ILIKE';
}
