/**
 * Layer CRDC (Civil Rights Data Collection) English Learner and Students
 * with Disabilities counts on top of the existing CCD entities.
 *
 * CRDC is biennial. The most recent release as of 2026 is 2021-22 data
 * (`YEAR=2021`). Counts are only reported at the school level; LEA and SEA
 * values are rolled up from schools by `lea_id` / `sea_id`.
 *
 * Usage:
 *   YEAR=2021 npm run db:ingest:crdc
 *
 * CRDC facet codes (verified by reconciling LAUSD totals with published
 * district figures — ~13% IDEA-served, ~22% EL):
 *   disability=1  — served under IDEA Part B (standard "SWD" definition)
 *   disability=2  — Section-504-only (not IDEA-eligible; NOT what we want)
 *   lep=1         — Limited English Proficient (i.e. EL / English learner)
 *   race=99, sex=99, disability=99, lep=99 — "total" across that dimension
 *
 * We query with all non-relevant facets pinned to 99 so each row has exactly
 * the count we want for one school.
 *
 * CRDC also uses -2 to mean "suppressed" and -1 for "not applicable";
 * `toInt` rejects negatives so those become null automatically.
 */

import { sql } from "../lib/db";

const YEAR = process.env.YEAR ?? "2021";
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

function pickString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// CRDC returns each school twice — once per reporting instrument — with
// identical `enrollment_crdc` but different `psenrollment_crdc`. Summing
// would double-count, so we take MAX across duplicates (values should be
// equal in every sample we checked, MAX is defensive against edge cases).
function bucketByNcessch(rows: Row[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = pickString(r.ncessch);
    if (!id) continue;
    const n = toInt(r.enrollment_crdc);
    if (n == null) continue;
    const prev = out.get(id);
    if (prev == null || n > prev) out.set(id, n);
  }
  return out;
}

async function ingestSWD(year: string): Promise<Map<string, number>> {
  console.log(`\n=== CRDC SWD (disability=1, IDEA) ===`);
  const rows = await fetchPaginated(
    `/schools/crdc/enrollment/${year}/disability/sex/` +
      `?per_page=${PAGE_SIZE}&race=99&sex=99&disability=1&lep=99`
  );
  const map = bucketByNcessch(rows);
  console.log(`  ${map.size} schools have a non-null SWD count`);
  return map;
}

async function ingestEL(year: string): Promise<Map<string, number>> {
  console.log(`\n=== CRDC EL (lep=1) ===`);
  const rows = await fetchPaginated(
    `/schools/crdc/enrollment/${year}/lep/sex/` +
      `?per_page=${PAGE_SIZE}&race=99&sex=99&disability=99&lep=1`
  );
  const map = bucketByNcessch(rows);
  console.log(`  ${map.size} schools have a non-null EL count`);
  return map;
}

async function applyToSchools(
  swd: Map<string, number>,
  el: Map<string, number>
) {
  console.log(`\n=== Applying CRDC counts to schools ===`);

  // Reset any existing values first so schools missing from the CRDC release
  // show up as null (not stale). Schools with nces_id present in either map
  // get the new value; ones not present get null.
  await sql`UPDATE entities SET english_learners = NULL, swd = NULL WHERE entity_type IN ('school', 'lea', 'sea')`;

  const ids = new Set<string>();
  for (const k of swd.keys()) ids.add(k);
  for (const k of el.keys()) ids.add(k);
  const allIds = [...ids];

  console.log(`  updating ${allIds.length} schools…`);

  // Build an unnest() update so we can push tens of thousands of rows in a
  // single round-trip rather than one-per-school.
  const ncessch: string[] = [];
  const elVals: (number | null)[] = [];
  const swdVals: (number | null)[] = [];
  for (const id of allIds) {
    ncessch.push(id);
    elVals.push(el.get(id) ?? null);
    swdVals.push(swd.get(id) ?? null);
  }

  await sql`
    UPDATE entities AS s
    SET english_learners = u.el,
        swd = u.swd,
        updated_at = now()
    FROM (
      SELECT
        unnest(${ncessch}::text[])   AS ncessch,
        unnest(${elVals}::int[])      AS el,
        unnest(${swdVals}::int[])     AS swd
    ) u
    WHERE s.entity_type = 'school' AND s.nces_id = u.ncessch
  `;
}

async function rollupToLeasAndSeas() {
  console.log(`\n=== Rolling CRDC counts up to LEAs ===`);
  await sql`
    UPDATE entities AS lea
    SET english_learners = sub.el_sum,
        swd = sub.swd_sum,
        updated_at = now()
    FROM (
      SELECT
        lea_id,
        SUM(english_learners)::int AS el_sum,
        SUM(swd)::int AS swd_sum
      FROM entities
      WHERE entity_type = 'school'
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea' AND lea.nces_id = sub.lea_id
  `;

  console.log(`=== Rolling CRDC counts up to SEAs ===`);
  await sql`
    UPDATE entities AS sea
    SET english_learners = sub.el_sum,
        swd = sub.swd_sum,
        updated_at = now()
    FROM (
      SELECT
        sea_id,
        SUM(english_learners)::int AS el_sum,
        SUM(swd)::int AS swd_sum
      FROM entities
      WHERE entity_type = 'lea' AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;
}

async function main() {
  // Fetch both dimensions before touching the DB so a failure mid-run
  // doesn't leave schools half-updated.
  const [swd, el] = await Promise.all([ingestSWD(YEAR), ingestEL(YEAR)]);
  await applyToSchools(swd, el);
  await rollupToLeasAndSeas();

  const summary = await sql<
    Array<{
      entity_type: string;
      total: number;
      with_el: number;
      with_swd: number;
    }>
  >`
    SELECT entity_type,
           COUNT(*)::int AS total,
           COUNT(english_learners)::int AS with_el,
           COUNT(swd)::int AS with_swd
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nCoverage after CRDC ingest:`);
  for (const r of summary) {
    console.log(
      `  ${r.entity_type}: ${r.total} total · ${r.with_el} with EL · ${r.with_swd} with SWD`
    );
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
