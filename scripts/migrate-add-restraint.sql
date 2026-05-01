-- CRDC restraint and seclusion: unique students subjected to mechanical
-- restraint, physical restraint, or seclusion. Stored as JSONB to mirror
-- the existing `discipline` column — same shape (metric × group), so the
-- existing Discipline tables can host restraint columns alongside the
-- five discipline metrics without a structural divergence.
--
-- Shape (per entity):
--   {
--     "mech_restraint": { "total":..., "swd":..., "white":..., ... },
--     "phys_restraint": { ... },
--     "seclusion":      { ... }
--   }
--
-- Earlier iteration of this column tracked raw INSTANCE counts in three
-- INTEGER columns and preserved CRDC sentinels (-1/-2/-3) verbatim. We
-- switched to students-level counts for visual consistency with the rest
-- of the Discipline section (which also reports unique students). Those
-- INTEGER columns are dropped here; CRDC sentinels become 0 in the
-- per-school cells just as they do for discipline.
ALTER TABLE entities DROP COLUMN IF EXISTS instances_mech_restraint;
ALTER TABLE entities DROP COLUMN IF EXISTS instances_phys_restraint;
ALTER TABLE entities DROP COLUMN IF EXISTS instances_seclusion;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS restraint JSONB;
