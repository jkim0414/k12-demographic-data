/**
 * Full NCES ingest via the Urban Institute Education Data API.
 *
 *   https://educationdata.urban.org/documentation/
 *
 * Urban Institute redistributes NCES CCD (Common Core of Data) as a paginated
 * JSON API. Data is authoritative CCD; delivery is cleaner than the raw
 * nces.ed.gov CSVs.
 *
 * Usage:
 *   YEAR=2023 npm run db:ingest               # districts + schools + SEAs
 *   YEAR=2023 LEVEL=school npm run db:ingest
 *   YEAR=2023 LEVEL=district npm run db:ingest
 *
 * Expect 15–30 minutes on a fresh load.
 *
 * Urban Institute race codes (verified against LAUSD 2023 totals):
 *   1 = White
 *   2 = Black
 *   3 = Hispanic
 *   4 = Asian
 *   5 = American Indian / Alaska Native
 *   6 = Native Hawaiian / Pacific Islander
 *   7 = Two or more races
 *   8 = Nonresident alien (rarely reported; excluded)
 *   9 = Unknown (rarely reported; excluded)
 *   99 = Total (excluded — we have `enrollment` from the directory)
 */

import { sql } from "../lib/db";
import { seaNameFromFips } from "../lib/states";

const YEAR = process.env.YEAR ?? "2023";
const LEVEL = (process.env.LEVEL ?? "all") as "all" | "school" | "district";
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
    const res = await fetchWithRetry(url);
    const body = (await res.json()) as { results: Row[]; next: string | null };
    out.push(...body.results);
    url = body.next;
  }
  console.log(`  done: ${out.length} rows from ${path}`);
  return out;
}

async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`${res.status} ${res.statusText}`);
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText} on ${url}`);
    } catch (e) {
      lastErr = e;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// FTE counts are fractional; preserve decimals. Negative values in these
// feeds mean suppressed/not-applicable (-1, -2), treat as null.
function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function pickString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function fipsToCode(fips: unknown): string | null {
  if (fips == null) return null;
  return String(fips).padStart(2, "0");
}

// Urban Institute race code → our column. Codes 99 (total), 8 (nonresident),
// 9 (unknown) are excluded from the race breakdown.
const RACE_COLUMN: Record<string, string | undefined> = {
  "1": "white",
  "2": "black",
  "3": "hispanic",
  "4": "asian",
  "5": "am_indian",
  "6": "pacific_islander",
  "7": "two_or_more",
};

// -- Districts ------------------------------------------------------------

async function ingestDistricts(year: string) {
  console.log(`\n=== LEAs ===`);
  console.log(`Fetching LEA directory for ${year}…`);
  const dir = await fetchPaginated(
    `/school-districts/ccd/directory/${year}/?per_page=${PAGE_SIZE}`
  );

  console.log(`Fetching LEA enrollment by race for ${year}…`);
  const enrollByRace = await fetchPaginated(
    `/school-districts/ccd/enrollment/${year}/grade-99/race/?per_page=${PAGE_SIZE}`
  );

  const byLea = new Map<string, Record<string, number>>();
  for (const r of enrollByRace) {
    const id = pickString(r.leaid);
    if (!id) continue;
    const col = RACE_COLUMN[String(r.race ?? "")];
    if (!col) continue;
    const count = toInt(r.enrollment);
    if (count == null) continue;
    const bucket = byLea.get(id) ?? {};
    bucket[col] = (bucket[col] ?? 0) + count;
    byLea.set(id, bucket);
  }

  console.log(`Upserting ${dir.length} LEAs…`);
  let done = 0;
  const schoolYear = `${year}-${String(Number(year) + 1).slice(-2)}`;
  for (const r of dir) {
    const nces_id = pickString(r.leaid);
    if (!nces_id) continue;
    const bucket = byLea.get(nces_id) ?? {};
    await upsertEntity({
      entity_type: "lea",
      nces_id,
      name: pickString(r.lea_name) ?? "Unknown LEA",
      state: pickString(r.state_location) ?? pickString(r.state_mailing),
      lea_id: null,
      sea_id: fipsToCode(r.fips),
      school_year: schoolYear,
      total_enrollment: toInt(r.enrollment),
      am_indian: bucket.am_indian ?? null,
      asian: bucket.asian ?? null,
      black: bucket.black ?? null,
      hispanic: bucket.hispanic ?? null,
      pacific_islander: bucket.pacific_islander ?? null,
      white: bucket.white ?? null,
      two_or_more: bucket.two_or_more ?? null,
      // FRL is not reported at the LEA level in the CCD LEA directory; it
      // gets rolled up from schools below after schools are ingested.
      frl_eligible: null,
      english_learners: toInt(r.english_language_learners),
      swd: toInt(r.spec_ed_students),
      // LEA-level staff counts from CCD directory. teachers_total_fte is
      // the sum of teachers across grade levels.
      // For counselors we use guidance_counselors_total_fte: it's the
      // broadest counselor count CCD publishes and is reliably populated
      // (Gwinnett and Denver report 0 / 30 for school_counselors_fte but
      // 487 / 200 for guidance_counselors_total_fte). The latter includes
      // non-school counselors but in practice the gap is small relative
      // to the inconsistent reporting on school_counselors_fte.
      teachers_fte: toFloat(r.teachers_total_fte),
      staff_total_fte: toFloat(r.staff_total_fte),
      counselors_fte: toFloat(r.guidance_counselors_total_fte),
      teachers_certified_fte: null,
      teachers_first_year_fte: null,
      teachers_absent_fte: null,
      // LEAs get rolled up from schools after the school ingest.
      cep_participating: null,
    });
    done += 1;
    if (done % 500 === 0) console.log(`  upserted ${done}/${dir.length}`);
  }
  console.log(`Done: ${done} LEAs upserted.`);
}

// -- Schools --------------------------------------------------------------

async function ingestSchools(year: string) {
  console.log(`\n=== Schools ===`);
  console.log(`Fetching school directory for ${year}…`);
  const dir = await fetchPaginated(
    `/schools/ccd/directory/${year}/?per_page=${PAGE_SIZE}`
  );

  console.log(`Fetching school enrollment by race for ${year}…`);
  const enrollByRace = await fetchPaginated(
    `/schools/ccd/enrollment/${year}/grade-99/race/?per_page=${PAGE_SIZE}`
  );

  const byNcessch = new Map<string, Record<string, number>>();
  for (const r of enrollByRace) {
    const id = pickString(r.ncessch);
    if (!id) continue;
    const col = RACE_COLUMN[String(r.race ?? "")];
    if (!col) continue;
    const count = toInt(r.enrollment);
    if (count == null) continue;
    const bucket = byNcessch.get(id) ?? {};
    bucket[col] = (bucket[col] ?? 0) + count;
    byNcessch.set(id, bucket);
  }

  console.log(`Upserting ${dir.length} schools…`);
  let done = 0;
  const schoolYear = `${year}-${String(Number(year) + 1).slice(-2)}`;
  for (const r of dir) {
    const nces_id = pickString(r.ncessch);
    if (!nces_id) continue;
    const bucket = byNcessch.get(nces_id) ?? {};
    await upsertEntity({
      entity_type: "school",
      nces_id,
      name: pickString(r.school_name) ?? "Unknown School",
      state: pickString(r.state_location) ?? pickString(r.state_mailing),
      lea_id: pickString(r.leaid),
      sea_id: fipsToCode(r.fips),
      school_year: schoolYear,
      total_enrollment: toInt(r.enrollment),
      am_indian: bucket.am_indian ?? null,
      asian: bucket.asian ?? null,
      black: bucket.black ?? null,
      hispanic: bucket.hispanic ?? null,
      pacific_islander: bucket.pacific_islander ?? null,
      white: bucket.white ?? null,
      two_or_more: bucket.two_or_more ?? null,
      frl_eligible: toInt(r.free_or_reduced_price_lunch),
      english_learners: null, // not in school directory
      swd: null,               // not in school directory
      // School-level staff: CCD only publishes one field (teachers_fte); the
      // rest come from CRDC and are layered on by ingest-crdc.ts.
      teachers_fte: toFloat(r.teachers_fte),
      staff_total_fte: null,
      counselors_fte: null,
      teachers_certified_fte: null,
      teachers_first_year_fte: null,
      teachers_absent_fte: null,
      // CEP indicator: CCD lunch_program = 2 means "NSLP with Community
      // Eligibility Option". (The `_cedp` fields are unrelated grade-
      // band indicators despite the suggestive name.)
      cep_participating: Number(r.lunch_program) === 2,
    });
    done += 1;
    if (done % 2000 === 0) console.log(`  upserted ${done}/${dir.length}`);
  }
  console.log(`Done: ${done} schools upserted.`);
}

// -- Roll-ups -------------------------------------------------------------

// Fill LEA-level FRL by summing over child schools (CCD doesn't publish FRL
// at the LEA level directly). Also recompute LEA enrollment coverage so the
// denominator matches.
async function rollupLeaCep() {
  console.log(`\n=== Rollups: LEA CEP flag from schools ===`);
  await sql`
    UPDATE entities AS lea
    SET cep_participating = sub.any_cep
    FROM (
      SELECT lea_id, BOOL_OR(cep_participating) AS any_cep
      FROM entities WHERE entity_type = 'school'
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea' AND lea.nces_id = sub.lea_id
  `;
}

async function rollupLeaFrl() {
  console.log(`\n=== Rollups: LEA FRL from schools ===`);
  await sql`
    UPDATE entities AS lea
    SET frl_eligible = sub.frl_sum
    FROM (
      SELECT lea_id, SUM(frl_eligible)::int AS frl_sum
      FROM entities
      WHERE entity_type = 'school' AND frl_eligible IS NOT NULL
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea'
      AND lea.nces_id = sub.lea_id
  `;
}

async function ingestSEAs(year: string) {
  console.log(`\n=== SEAs (rollup from LEAs) ===`);
  const rows = await sql<
    Array<{
      sea_id: string;
      state: string | null;
      total_enrollment: number | null;
      am_indian: number | null;
      asian: number | null;
      black: number | null;
      hispanic: number | null;
      pacific_islander: number | null;
      white: number | null;
      two_or_more: number | null;
      frl_eligible: number | null;
      english_learners: number | null;
      swd: number | null;
      teachers_fte: number | null;
      staff_total_fte: number | null;
      counselors_fte: number | null;
      teachers_certified_fte: number | null;
      teachers_first_year_fte: number | null;
      teachers_absent_fte: number | null;
      cep_participating: boolean | null;
    }>
  >`
    SELECT
      sea_id,
      mode() WITHIN GROUP (ORDER BY state) AS state,
      SUM(total_enrollment)::int        AS total_enrollment,
      SUM(am_indian)::int               AS am_indian,
      SUM(asian)::int                   AS asian,
      SUM(black)::int                   AS black,
      SUM(hispanic)::int                AS hispanic,
      SUM(pacific_islander)::int        AS pacific_islander,
      SUM(white)::int                   AS white,
      SUM(two_or_more)::int             AS two_or_more,
      SUM(frl_eligible)::int            AS frl_eligible,
      SUM(english_learners)::int        AS english_learners,
      SUM(swd)::int                     AS swd,
      SUM(teachers_fte)::real           AS teachers_fte,
      SUM(staff_total_fte)::real        AS staff_total_fte,
      SUM(counselors_fte)::real         AS counselors_fte,
      SUM(teachers_certified_fte)::real AS teachers_certified_fte,
      SUM(teachers_first_year_fte)::real AS teachers_first_year_fte,
      SUM(teachers_absent_fte)::real    AS teachers_absent_fte,
      BOOL_OR(cep_participating)        AS cep_participating
    FROM entities
    WHERE entity_type = 'lea' AND sea_id IS NOT NULL
    GROUP BY sea_id
  `;

  const schoolYear = `${year}-${String(Number(year) + 1).slice(-2)}`;
  for (const r of rows) {
    await upsertEntity({
      entity_type: "sea",
      nces_id: r.sea_id,
      name: seaNameFromFips(r.sea_id),
      state: r.state,
      lea_id: null,
      sea_id: null,
      school_year: schoolYear,
      total_enrollment: r.total_enrollment,
      am_indian: r.am_indian,
      asian: r.asian,
      black: r.black,
      hispanic: r.hispanic,
      pacific_islander: r.pacific_islander,
      white: r.white,
      two_or_more: r.two_or_more,
      frl_eligible: r.frl_eligible,
      english_learners: r.english_learners,
      swd: r.swd,
      teachers_fte: r.teachers_fte,
      staff_total_fte: r.staff_total_fte,
      counselors_fte: r.counselors_fte,
      teachers_certified_fte: r.teachers_certified_fte,
      teachers_first_year_fte: r.teachers_first_year_fte,
      teachers_absent_fte: r.teachers_absent_fte,
      cep_participating: r.cep_participating,
    });
  }
  console.log(`Done: ${rows.length} SEAs upserted.`);
}

// -- Upsert ---------------------------------------------------------------

type EntityRecord = {
  entity_type: "sea" | "lea" | "school";
  nces_id: string;
  name: string;
  state: string | null;
  lea_id: string | null;
  sea_id: string | null;
  school_year: string | null;
  total_enrollment: number | null;
  am_indian: number | null;
  asian: number | null;
  black: number | null;
  hispanic: number | null;
  pacific_islander: number | null;
  white: number | null;
  two_or_more: number | null;
  frl_eligible: number | null;
  english_learners: number | null;
  swd: number | null;
  teachers_fte: number | null;
  staff_total_fte: number | null;
  counselors_fte: number | null;
  teachers_certified_fte: number | null;
  teachers_first_year_fte: number | null;
  teachers_absent_fte: number | null;
  cep_participating: boolean | null;
};

async function upsertEntity(e: EntityRecord) {
  await sql`
    INSERT INTO entities ${sql(e as unknown as Record<string, unknown>)}
    ON CONFLICT (nces_id) DO UPDATE SET
      entity_type             = EXCLUDED.entity_type,
      name                    = EXCLUDED.name,
      state                   = EXCLUDED.state,
      lea_id                  = EXCLUDED.lea_id,
      sea_id                  = EXCLUDED.sea_id,
      school_year             = EXCLUDED.school_year,
      total_enrollment        = EXCLUDED.total_enrollment,
      am_indian               = EXCLUDED.am_indian,
      asian                   = EXCLUDED.asian,
      black                   = EXCLUDED.black,
      hispanic                = EXCLUDED.hispanic,
      pacific_islander        = EXCLUDED.pacific_islander,
      white                   = EXCLUDED.white,
      two_or_more             = EXCLUDED.two_or_more,
      frl_eligible            = EXCLUDED.frl_eligible,
      english_learners        = EXCLUDED.english_learners,
      swd                     = EXCLUDED.swd,
      teachers_fte            = EXCLUDED.teachers_fte,
      staff_total_fte         = EXCLUDED.staff_total_fte,
      counselors_fte          = EXCLUDED.counselors_fte,
      teachers_certified_fte  = EXCLUDED.teachers_certified_fte,
      teachers_first_year_fte = EXCLUDED.teachers_first_year_fte,
      teachers_absent_fte     = EXCLUDED.teachers_absent_fte,
      cep_participating       = EXCLUDED.cep_participating,
      updated_at              = now()
  `;
}

// -- Main -----------------------------------------------------------------

async function main() {
  if (LEVEL === "all" || LEVEL === "district") await ingestDistricts(YEAR);
  if (LEVEL === "all" || LEVEL === "school") await ingestSchools(YEAR);
  if (LEVEL === "all") {
    await rollupLeaFrl();
    await rollupLeaCep();
    await ingestSEAs(YEAR);
  }
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM entities`;
  console.log(`\nFinal: ${count} entities in database.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
