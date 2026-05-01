-- NCES entities + demographics schema.
-- Runs idempotently (drops + recreates the table).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS entities;

CREATE TABLE entities (
  id                SERIAL PRIMARY KEY,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('sea', 'lea', 'school')),
  nces_id           TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  state             TEXT,          -- two-letter USPS code
  lea_id            TEXT,          -- parent LEA (for schools)
  sea_id            TEXT,          -- parent SEA (for LEAs and schools)
  school_year       TEXT,

  total_enrollment  INTEGER,

  -- race/ethnicity counts
  am_indian         INTEGER,
  asian             INTEGER,
  black             INTEGER,
  hispanic          INTEGER,
  pacific_islander  INTEGER,
  white             INTEGER,
  two_or_more       INTEGER,

  -- economic / program counts
  frl_eligible      INTEGER,       -- free + reduced price lunch eligible
  english_learners  INTEGER,
  swd               INTEGER,       -- students with disabilities

  -- Community Eligibility Provision flag. School-level: any of the four
  -- CCD `*_cedp` indicators. LEA/SEA: any descendant participates. Used
  -- to surface that the FRL field's reporting methodology varies by
  -- district under CEP.
  cep_participating BOOLEAN,

  -- staff FTE (fractional allowed)
  -- CCD directory: teachers_fte (LEAs + schools), staff_total_fte (LEAs only),
  -- counselors_fte at LEA level. CRDC teachers-staff: certified/first-year/
  -- absent teachers FTE at school level (rolled up to LEAs).
  teachers_fte            REAL,
  staff_total_fte         REAL,
  counselors_fte          REAL,
  teachers_certified_fte  REAL,
  teachers_first_year_fte REAL,
  teachers_absent_fte     REAL,
  -- CRDC's own teacher-FTE count, kept separate from CCD's teachers_fte
  -- so cert%/first-year%/absent% percentages have a same-vintage
  -- denominator (otherwise mixing CRDC numerator with CCD denominator
  -- can exceed 100%).
  teachers_fte_crdc       REAL,

  -- Community population: residents within the LEA's geographic boundary
  -- (not enrolled students). Sourced from Census SAIPE; LEA-level only,
  -- rolled up to SEAs. NULL on schools — concept doesn't apply at school
  -- level since multiple schools share a district boundary.
  population_total          INTEGER,
  population_5_17           INTEGER,
  population_5_17_poverty   INTEGER,
  saipe_year                TEXT,

  -- Community race/ethnicity + income from Census ACS 5-year, joined to
  -- LEAs via the (state FIPS + district code) tuple. Same boundary basis
  -- as SAIPE. Schools left null. SEAs are population-summed for race;
  -- median household income at SEA level is computed as a population-
  -- weighted average of LEA medians at query time, not stored.
  community_white               INTEGER,
  community_black               INTEGER,
  community_hispanic            INTEGER,
  community_asian               INTEGER,
  community_am_indian           INTEGER,
  community_pacific_islander    INTEGER,
  community_two_or_more         INTEGER,
  community_population_acs      INTEGER,
  median_household_income       INTEGER,
  acs_year                      TEXT,

  -- CRDC discipline counts (per metric × group) stored as JSONB.
  discipline                    JSONB,

  -- CRDC restraint and seclusion. Same shape as `discipline` (metric ×
  -- group counts of unique students). Held in a separate JSONB column
  -- because the metric set is different (mech_restraint, phys_restraint,
  -- seclusion) and we don't want to overload one column with mixed
  -- metric vocabularies.
  restraint                     JSONB,

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entities_nces_id ON entities (nces_id);
CREATE INDEX idx_entities_state   ON entities (state);
CREATE INDEX idx_entities_type    ON entities (entity_type);
CREATE INDEX idx_entities_name_trgm ON entities USING gin (name gin_trgm_ops);
