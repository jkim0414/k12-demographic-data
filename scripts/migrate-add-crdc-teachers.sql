-- Add CRDC's own teacher-FTE count so we can compute % certified /
-- % first-year / % absent against a same-vintage denominator. Using
-- CCD's teachers_fte (newer year) as the denominator can produce
-- nonsensical >100% percentages.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS teachers_fte_crdc REAL;
