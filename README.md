# K-12 Demographic Data

A Next.js + Postgres app that lets you look up NCES schools, districts
(LEAs), and state education agencies (SEAs) by name or code, and aggregate
their demographic data (race/ethnicity, free/reduced-price lunch,
English learners, students with disabilities).

Matching is:

- **Exact** when you give an NCES code (`06` for a SEA, 7 digits for a LEA,
  12 digits for a school).
- **Fuzzy** when you give a name — the database uses the `pg_trgm` extension
  to rank trigram-similar names.

Aggregation is **enrollment-weighted**: each field's percentage is computed
against the total enrollment of the entities that actually reported that
field, so partially-reported fields don't appear artificially low.

## Quick start

### 1. Postgres

Any Postgres 13+ instance will do. The app needs the `pg_trgm` extension,
which ships with Postgres but must be enabled (the schema script does it for
you).

**Local dev with Docker:**

```bash
docker run --name k12-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

**On Vercel:** add a Neon or Vercel Postgres integration to your project. It
will populate `DATABASE_URL` automatically.

### 2. Environment

```bash
cp .env.example .env.local
# then edit DATABASE_URL if needed
```

### 3. Install and initialize

```bash
npm install
npm run db:schema    # creates the entities table + indexes
npm run db:seed      # loads ~40 hand-curated entities so you can try it out
npm run dev
```

Visit <http://localhost:3000>.

### 4. Full data load (optional)

The seed is intentionally tiny. For the real NCES CCD dataset (~18k LEAs,
~100k schools), run:

```bash
YEAR=2023 npm run db:ingest
```

This pulls from the [Urban Institute Education Data API][ued], which
redistributes CCD as JSON. Expect 10–30 minutes.

To ingest only one level:

```bash
YEAR=2023 LEVEL=district npm run db:ingest
YEAR=2023 LEVEL=school   npm run db:ingest
```

SEAs are computed by rolling up LEA totals per state.

[ued]: https://educationdata.urban.org/documentation/

## Uploading a spreadsheet

Recognized column headers (first row of the file):

| Column                                         | Interpreted as   |
| ---------------------------------------------- | ---------------- |
| `nces_id`, `ncesid`, `code`, `leaid`, `ncessch`, `school_id`, `district_id` | Exact-match code |
| `name`, `school_name`, `lea_name`, `district_name`, `entity_name`           | Fuzzy name match |

If both are present, the code is tried first. Rows whose top hit scores
below 50% similarity (or whose top two hits are within 15 percentage points
of each other) are flagged for manual review — you confirm/override them in
the review table before they get aggregated.

## Project layout

```
app/
  api/
    search/      — GET /api/search?q=…       autocomplete
    match/       — POST /api/match           bulk name/code → entity id
    aggregate/   — POST /api/aggregate       compute aggregate demographics
  components/
    EntityAutocomplete.tsx
    FileUpload.tsx
    MatchReview.tsx
    ResultsPanel.tsx
    SelectedEntities.tsx
  page.tsx
lib/
  db.ts          — postgres.js client (singleton in dev)
  aggregate.ts   — pure aggregation + formatting helpers
  types.ts
scripts/
  schema.sql     — one table + indexes (idempotent)
  apply-schema.ts
  seed.ts        — hand-curated demo data
  ingest.ts      — full CCD load via Urban Institute API
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. `vercel link` or import it in the Vercel dashboard.
3. Add a Neon or Vercel Postgres integration — it sets `DATABASE_URL`.
4. In the Vercel dashboard, run `npm run db:schema` once (e.g. via the
   Neon SQL editor, or by opening a connection from your laptop).
5. Either `npm run db:seed` from your laptop against the production DB or
   run the full `db:ingest` there.
6. Deploy.

## Caveats

- CCD is ~18 months behind real time. The most recent full release is
  typically two school years prior to the current one (e.g. 2023-24 for
  ingests run in 2026).
- SEA totals are computed by rolling up LEA reports; they may differ
  slightly from state-published totals because of reporting timing.
- Percentages are weighted by reported enrollment. A school that doesn't
  report FRL is excluded from the FRL denominator, not counted as zero.
