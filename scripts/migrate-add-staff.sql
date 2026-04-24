-- Add staff FTE columns to an existing entities table, idempotently. Safe
-- to run against any DB created by schema.sql before the staff columns
-- were introduced.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS teachers_fte            REAL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS staff_total_fte         REAL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS counselors_fte          REAL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS teachers_certified_fte  REAL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS teachers_first_year_fte REAL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS teachers_absent_fte     REAL;
