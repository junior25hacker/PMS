import { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL `numeric` columns are returned as strings by the `pg` driver.
 * This transformer keeps money/quantity values as real numbers in the domain
 * layer while preserving exact numeric storage in the database.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null => (value === null || value === undefined ? null : value),
  from: (value?: string | number | null): number | null => {
    if (value === null || value === undefined) return null;
    return typeof value === 'number' ? value : parseFloat(value);
  },
};
