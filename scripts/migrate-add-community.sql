-- Add SAIPE community-population columns to the entities table.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS population_total          INTEGER;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS population_5_17           INTEGER;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS population_5_17_poverty   INTEGER;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS saipe_year                TEXT;
