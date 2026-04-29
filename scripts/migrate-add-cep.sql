-- CEP (Community Eligibility Provision) participation flag.
-- True for any school where CCD's elem/middle/high/ungrade _cedp = 1.
-- Rolled up to LEAs and SEAs as "any descendant participates".
-- Useful because under CEP, the FRL field's value depends on a
-- per-district methodology choice (universal-eligibility 100%,
-- identified × 1.6, or applications-based) and can swing year-to-year
-- without an underlying demographic shift.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS cep_participating BOOLEAN;
