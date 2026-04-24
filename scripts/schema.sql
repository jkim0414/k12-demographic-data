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

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entities_nces_id ON entities (nces_id);
CREATE INDEX idx_entities_state   ON entities (state);
CREATE INDEX idx_entities_type    ON entities (entity_type);
CREATE INDEX idx_entities_name_trgm ON entities USING gin (name gin_trgm_ops);
