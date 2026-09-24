import { ColumnType, Repository } from 'typeorm';

/**
 * Returns 'LIKE' for SQLite (where LIKE is case-insensitive for ASCII and ILIKE does not exist)
 * and 'ILIKE' for PostgreSQL (where LIKE is case-sensitive).
 * If repo is undefined or not connected to SQLite (e.g. PostgreSQL or in unit test mocks),
 * defaults to 'ILIKE'.
 */
export function ilikeOp(repo?: Repository<any>): string {
  return repo?.manager?.connection?.options?.type === 'sqlite' ? 'LIKE' : 'ILIKE';
}

/**
 * Returns 'timestamp' when configured for PostgreSQL and 'datetime' for SQLite.
 * TypeORM strictly validates column data types per dialect.
 */
export function timestampType(): ColumnType {
  const dbType = (process.env.DB_TYPE ?? '').toLowerCase();
  const isPostgres =
    dbType === 'postgres' ||
    dbType === 'postgresql' ||
    Boolean(process.env.DATABASE_URL);

  return isPostgres ? 'timestamp' : 'datetime';
}
