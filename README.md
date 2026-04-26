# K-12 District Data Explorer

Live: <https://k12-demographic-data.vercel.app>

Look up and aggregate data for U.S. schools, school districts (LEAs),
and state education agencies (SEAs). Combines four federal data sources
joined to NCES district boundaries, so you can compare *enrolled
students* against the *community living within district lines* in a
single view.

## Sources

| Source                         | Vintage    | What it provides |
| ------------------------------ | ---------- | ---------------- |
| **NCES Common Core of Data**   | 2023-24    | Enrollment, race/ethnicity of enrolled students, FRL, teacher and counselor FTE |
| **Civil Rights Data Collection** (CRDC) | 2021-22 | English learners, students with disabilities, teacher certification, first-year teachers, teacher absenteeism |
| **Census SAIPE**               | 2023-24    | Total population and school-age (5–17) population in poverty within district boundaries |
| **Census ACS 5-year**          | 2019-2023  | Community race/ethnicity and median household income within district boundaries |

All four are pulled via the [Urban Institute Education Data API][ued]
(NCES + CRDC + SAIPE) and the [Census Bureau API][census] (ACS),
joined to NCES districts via state FIPS + 5-digit district code.

[ued]: https://educationdata.urban.org/documentation/
[census]: https://www.census.gov/data/developers/data-sets/acs-5year.html

## Features

- **Autocomplete search** — exact match by NCES code (12-digit school
  NCESSCH, 7-digit LEAID, 2-digit SEA FIPS, or 2-letter state code),
  fuzzy match by name (`pg_trgm` trigram similarity).
- **Spreadsheet upload** — CSV/TSV/XLSX with a name or NCES-ID column;
  ambiguous matches go to a review table before aggregation.
- **Aggregation across selected entities** with enrollment-weighted
  percentages, population-weighted median income, and a derived
  public-school capture rate (enrolled ÷ school-age residents).
- **Side-by-side enrolled vs. community race/ethnicity** with a colored
  gap badge so you can see who attends vs. who lives in the boundary.
- **Coverage flags** on every aggregated number — partial-coverage
  metrics show `(N/M)` in amber with a tooltip; entities missing a
  value show a dotted-underline `—` with a "not reported by …" tooltip.
- **CSV / JSON export** of either the aggregate or per-entity rows.

## Data quirks worth knowing

These are *upstream* data realities, surfaced honestly in the UI:

- **CRDC 2021-22 suppressed first-year teachers and teacher
  absenteeism for every school nationwide** — those rows auto-hide.
  They'll come back when a future CRDC release publishes the fields.
- **% certified can exceed 100%** in raw CRDC data because of
  multi-credential counting at small districts; we use CRDC's own
  teacher count as the denominator (not CCD's), and clamp display to
  ">100% (CRDC reporting quirk)".
- **Public-school capture rate above 100%** is common for charter,
  virtual, and magnet districts that enroll students from outside
  their tabulated boundary, and for rural districts where the
  SAIPE-tabulated boundary doesn't match the actual service area.
- **Some LEAs entirely suppress an EL row** in CRDC for a given cycle
  (e.g. SFUSD 2021-22). Those entities show a dotted `—` with a
  "Not reported or suppressed by CRDC 2021-22 for this entity" tooltip.

## Quick start

### 1. Postgres

Postgres 13+ with the `pg_trgm` extension (the schema script enables
it). Locally, the easiest setup is Homebrew:

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb k12
```

Or Docker:

```bash
docker run --name k12-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

### 2. Environment

```bash
cp .env.example .env.local
# adjust DATABASE_URL if needed
```

### 3. Install + initialize

```bash
npm install
npm run db:schema   # creates the entities table + indexes
npm run db:seed     # ~40 hand-curated entities so you can demo immediately
npm run dev
```

Open <http://localhost:3000>.

### 4. Full data load

The seed is intentionally tiny. To load the real ~120k-entity dataset,
run the four ingest scripts in this order. Each is idempotent and
re-runnable.

```bash
YEAR=2023 npm run db:ingest               # CCD: 19,637 LEAs + 102,274 schools (~40 min)
YEAR=2021 npm run db:ingest:crdc          # CRDC EL/SWD/teacher quality (~5 min)
YEAR=2023 npm run db:patch:ccd-lea-staff  # Re-pulls LEA staff totals (~2 min)
YEAR=2023 npm run db:ingest:saipe         # Census SAIPE (~30 sec)
YEAR=2023 npm run db:ingest:acs           # Census ACS race + income (~3 min)
npm run db:rename-seas                    # SEA names: "06" → "California State Education Agency"
```

**Run the patch *after* CRDC**, not before — CRDC's reset step
nullifies counselor FTE for non-LEA entities, so the LEA-staff patch
must repopulate them.

For schema migrations on an existing database (rather than a fresh
`npm run db:schema`), apply the SQL files in `scripts/migrate-*.sql` in
chronological order.

## Spreadsheet upload

Recognized column headers (first row of the file):

| Column                                                                           | Interpreted as   |
| -------------------------------------------------------------------------------- | ---------------- |
| `nces_id`, `ncesid`, `leaid`, `ncessch`, `school_id`, `district_id`              | Exact-match code |
| `name`, `school_name`, `lea_name`, `district_name`, `entity_name`                | Fuzzy name match |

If both are present, the code is tried first. Rows whose top hit scores
below 50% similarity (or whose top two hits are within 15 percentage
points of each other) get flagged for manual review — you confirm or
override them in the review table before they're aggregated.

## Aggregation rules

- **Race/ethnicity, FRL, EL, SWD percentages** are computed against the
  total enrollment of *entities that actually reported the field*, not
  the grand total. Partial coverage is surfaced with `(N/M)` markers.
- **Public-school capture rate** uses school-age (5–17) population from
  SAIPE — not total community population — as the denominator. This is
  the only honest reading; the full population includes adults who
  don't attend K-12.
- **Cert / first-year / absent teacher percentages** use CRDC's own
  teacher count (`teachers_fte_crdc`) as the denominator, not CCD's
  newer `teachers_fte`, so vintages match.
- **Median household income** for multi-entity selections is a
  *population-weighted* average of LEA medians. True grand medians
  require microdata; this approximates state-level published medians
  within ~1–2%.

## Project layout

```
app/
  api/
    search/      GET  /api/search?q=…    autocomplete
    match/       POST /api/match         bulk name/code → entity id
    aggregate/   POST /api/aggregate     compute aggregate metrics
  components/
    EntityAutocomplete.tsx               cmdk-based autocomplete
    FileUpload.tsx                       CSV/TSV/XLSX parser
    MatchReview.tsx                      ambiguous-match confirm screen
    ResultsPanel.tsx                     headline strip + nav + tables
    SelectedEntities.tsx                 entity pill list
    Tooltip.tsx                          portal-rendered hover tooltip
  layout.tsx
  page.tsx
lib/
  db.ts          postgres.js client (lazy proxy + prepare:false for Neon)
  types.ts       Entity, Aggregate, demographic / staff / community fields
  aggregate.ts   pure aggregation + formatting helpers
  states.ts      FIPS → state-name lookup
scripts/
  schema.sql                       one entities table + indexes
  apply-schema.ts                  applies schema.sql
  seed.ts                          hand-curated demo data
  ingest.ts                        CCD: LEAs + schools + SEA rollup
  ingest-crdc.ts                   CRDC: EL, SWD, teacher quality
  ingest-saipe.ts                  Census SAIPE: population + child poverty
  ingest-acs.ts                    Census ACS: community race + income
  patch-ccd-lea-staff.ts           Refetch LEA staff totals from CCD
  rename-seas.ts                   Rename SEAs from FIPS code to full state name
  migrate-add-staff.sql            ALTER TABLE migrations applied between schema versions
  migrate-add-community.sql
  migrate-add-community-race.sql
  migrate-add-crdc-teachers.sql
```

## Deploying to Vercel

1. Push the repo to GitHub.
2. `vercel link` (creates the project) or import in the Vercel dashboard.
3. Add a Postgres integration via Vercel Storage. Either Vercel
   Postgres or Neon works — the integration auto-populates
   `DATABASE_URL`, `POSTGRES_URL`, and `DATABASE_URL_UNPOOLED` in the
   project's env.
4. Apply the schema and load data once. Either:
   - **From local against the Neon URL**: `vercel env pull
     .env.production`, set `DATABASE_URL` to the unpooled URL, run the
     ingest scripts. Faster than running them in a serverless function.
   - **Or pg_dump locally and pg_restore to Neon** if you've already
     loaded data on a local Postgres.
5. `vercel deploy --prod`.

The app uses `prepare: false` on the postgres.js client so it stays
healthy across schema changes when going through Neon's pgbouncer-style
pooler (otherwise an `ALTER TABLE` will surface as `cached plan must
not change result type` until connections recycle).

### Web Analytics + Speed Insights

Both Vercel first-party SDKs are wired into the root layout. Enable
each in the Vercel dashboard (Project → Analytics, Project → Speed
Insights) for events to start flowing.

## Caveats

- **CCD is ~18 months behind real time.** Run the ingest with the
  most recent year that the Urban Institute API has populated.
- **CRDC is biennial** and skipped 2019-20 due to COVID. The current
  release (2021-22) suppresses some fields entirely (see Data quirks
  above).
- **SEA totals roll up from LEA reports** and may differ slightly from
  state-published totals due to reporting timing or which LEAs each
  source counts in a state.
- **Schools have no community data** — boundary-level concept doesn't
  apply at the school level (multiple schools share a district
  boundary). The Community section auto-hides for school-only
  selections.
