/**
 * Layer Census SAIPE (Small Area Income and Poverty Estimates) onto LEAs.
 *
 *   YEAR=2023 npm run db:ingest:saipe
 *
 * SAIPE gives the population *living inside* an LEA's geographic boundary —
 * a different question than "students enrolled in this LEA's schools". Both
 * are useful and the UI should show them side-by-side.
 *
 * Available estimates (from the Urban Institute redistribution):
 *   - total resident population
 *   - school-age (5–17) resident population
 *   - school-age in poverty
 *   - poverty rate (derived)
 *
 * No school-level data: a school's catchment is a sub-district concept that
 * SAIPE doesn't model.
 *
 * SAIPE returns leaid stripped of its leading zero on the FIPS portion
 * (e.g. CA's '06' becomes '6'), so the leaid is 4–6 chars instead of the
 * 7-char NCES standard. We pad back to 7 to match our entities.nces_id.
 */

import { sql } from "../lib/db";

const YEAR = process.env.YEAR ?? "2023";
const PAGE_SIZE = 1000;
const BASE = "https://educationdata.urban.org/api/v1";

type Row = Record<string, unknown>;

async function fetchPaginated(path: string): Promise<Row[]> {
  const out: Row[] = [];
  let url: string | null = `${BASE}${path}`;
  let page = 0;
  while (url) {
    page += 1;
    if (page === 1 || page % 10 === 0) {
      console.log(`  fetch page ${page} (${out.length} rows so far)`);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
    const body = (await res.json()) as { results: Row[]; next: string | null };
    out.push(...body.results);
    url = body.next;
  }
  console.log(`  done: ${out.length} rows`);
  return out;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function pickString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function ncesIdFromSaipe(saipeLeaid: unknown): string | null {
  const s = pickString(saipeLeaid);
  if (!s) return null;
  return s.padStart(7, "0");
}

async function main() {
  const schoolYear = `${YEAR}-${String(Number(YEAR) + 1).slice(-2)}`;

  console.log(`Fetching SAIPE LEA estimates for ${YEAR}…`);
  const rows = await fetchPaginated(
    `/school-districts/saipe/${YEAR}/?per_page=${PAGE_SIZE}`
  );

  const leaids: string[] = [];
  const totals: (number | null)[] = [];
  const ages: (number | null)[] = [];
  const povs: (number | null)[] = [];
  for (const r of rows) {
    const id = ncesIdFromSaipe(r.leaid);
    if (!id) continue;
    leaids.push(id);
    totals.push(toInt(r.est_population_total));
    ages.push(toInt(r.est_population_5_17));
    povs.push(toInt(r.est_population_5_17_poverty));
  }
  console.log(`Applying ${leaids.length} LEAs…`);

  await sql`
    UPDATE entities AS lea
    SET population_total        = u.total,
        population_5_17         = u.age,
        population_5_17_poverty = u.pov,
        saipe_year              = ${schoolYear},
        updated_at              = now()
    FROM (
      SELECT
        unnest(${leaids}::text[]) AS leaid,
        unnest(${totals}::int[])  AS total,
        unnest(${ages}::int[])    AS age,
        unnest(${povs}::int[])    AS pov
    ) u
    WHERE lea.entity_type = 'lea' AND lea.nces_id = u.leaid
  `;

  console.log(`Rolling SAIPE totals up to SEAs…`);
  await sql`
    UPDATE entities AS sea
    SET population_total        = sub.total_sum,
        population_5_17         = sub.age_sum,
        population_5_17_poverty = sub.pov_sum,
        saipe_year              = ${schoolYear},
        updated_at              = now()
    FROM (
      SELECT
        sea_id,
        SUM(population_total)::int        AS total_sum,
        SUM(population_5_17)::int         AS age_sum,
        SUM(population_5_17_poverty)::int AS pov_sum
      FROM entities
      WHERE entity_type = 'lea' AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;

  const summary = await sql<
    Array<{
      entity_type: string;
      total: number;
      with_pop: number;
      with_pov: number;
    }>
  >`
    SELECT entity_type,
           COUNT(*)::int                       AS total,
           COUNT(population_total)::int        AS with_pop,
           COUNT(population_5_17_poverty)::int AS with_pov
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nCoverage after SAIPE ingest:`);
  for (const r of summary) {
    console.log(
      `  ${r.entity_type}: ${r.total} total · pop=${r.with_pop} · pov=${r.with_pov}`
    );
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
