/**
 * Layer CRDC restraint and seclusion student counts onto schools, then
 * roll up to LEAs and SEAs.
 *
 *   YEAR=2021 npm run db:ingest:restraint
 *
 * Three metrics per entity (unique students subjected to each):
 *   mech_restraint        students_mech_restraint
 *   phys_restraint        students_phys_restraint
 *   seclusion             students_seclusion
 *
 * For each metric we collect 9 group counts (mirroring discipline):
 *   total, swd, white, black, hispanic, asian, am_indian,
 *   pacific_islander, two_or_more
 *
 * Achieved with 9 calls to the disability/race/sex/ endpoint, each
 * pinning four of the five facet dimensions to specific values and
 * leaving the fifth as a per-school slice. Same pattern as
 * ingest-discipline.ts.
 *
 * Stored as JSONB on entities.restraint. The Discipline UI tables host
 * these as three additional metric columns alongside the five
 * discipline columns, so the per-entity / aggregate / disproportionality
 * shape is identical.
 *
 * (Earlier iteration of this ingest used the /instances/ endpoint and
 * tracked raw incident counts plus CRDC sentinel codes; we switched to
 * the students-level endpoint to match the unit and structure of the
 * existing Discipline tables. CRDC sentinels coerce to 0 here, same as
 * the discipline ingest.)
 */

import { sql } from "../lib/db";

const YEAR = process.env.YEAR ?? "2021";
const PAGE_SIZE = 1000;
const BASE = "https://educationdata.urban.org/api/v1";
const ENDPOINT = `/schools/crdc/restraint-and-seclusion/${YEAR}/disability/race/sex/`;

type Row = Record<string, unknown>;

// --- HTTP helpers ----------------------------------------------------------

async function fetchPaginated(query: string): Promise<Row[]> {
  const out: Row[] = [];
  let url: string | null = `${BASE}${ENDPOINT}?${query}`;
  let page = 0;
  while (url) {
    page += 1;
    if (page === 1 || page % 25 === 0) {
      process.stdout.write(`  page ${page} (${out.length} rows)\r`);
    }
    const res = await fetchWithRetry(url);
    const body = (await res.json()) as { results: Row[]; next: string | null };
    out.push(...body.results);
    url = body.next;
  }
  process.stdout.write("\n");
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

// --- Field math ------------------------------------------------------------

// CRDC sentinel values: -1 = not applicable, -2 = suppressed, -3 = quality
// flagged. Coerce all negatives to null; we then `?? 0` so suppressed
// student counts read as 0 in the rollup. Matches discipline's behavior.
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type Metrics = {
  mech_restraint: number;
  phys_restraint: number;
  seclusion: number;
};

const METRIC_KEYS: (keyof Metrics)[] = [
  "mech_restraint",
  "phys_restraint",
  "seclusion",
];

function rowToMetrics(r: Row): Metrics {
  const n = (k: string) => toNum(r[k]) ?? 0;
  return {
    mech_restraint: n("students_mech_restraint"),
    phys_restraint: n("students_phys_restraint"),
    seclusion: n("students_seclusion"),
  };
}

// Whether the row has any reported (non-suppressed) student count.
// Schools whose entire restraint section is suppressed/n.a. don't make
// it into the rollup at all — same behavior as the discipline ingest.
function rowHasReporting(r: Row): boolean {
  return [
    "students_mech_restraint",
    "students_phys_restraint",
    "students_seclusion",
  ].some((f) => toNum(r[f]) != null);
}

// --- Group fetches ---------------------------------------------------------

type Group =
  | "total"
  | "swd"
  | "white"
  | "black"
  | "hispanic"
  | "asian"
  | "am_indian"
  | "pacific_islander"
  | "two_or_more";

const RACE_CODES: Record<Exclude<Group, "total" | "swd">, number> = {
  white: 1,
  black: 2,
  hispanic: 3,
  asian: 4,
  am_indian: 5,
  pacific_islander: 6,
  two_or_more: 7,
};

function queryFor(group: Group): string {
  // Pin every dimension; we want one row per school for this group.
  const params = new URLSearchParams({
    sex: "99",
    lep: "99",
    per_page: String(PAGE_SIZE),
  });
  if (group === "total") {
    params.set("race", "99");
    params.set("disability", "99");
  } else if (group === "swd") {
    params.set("race", "99");
    // Same caveat as ingest-discipline.ts: CRDC's disability codes flip
    // between endpoints; in this one (and in discipline), 1 = IDEA-served.
    params.set("disability", "1");
  } else {
    params.set("race", String(RACE_CODES[group]));
    params.set("disability", "99");
  }
  return params.toString();
}

async function fetchGroup(group: Group): Promise<Map<string, Metrics>> {
  console.log(`\n[${group}] fetching…`);
  const rows = await fetchPaginated(queryFor(group));
  const out = new Map<string, Metrics>();
  for (const r of rows) {
    const id = r.ncessch == null ? null : String(r.ncessch);
    if (!id) continue;
    if (!rowHasReporting(r)) continue;
    out.set(id, rowToMetrics(r));
  }
  console.log(
    `[${group}] ${rows.length} rows fetched, ${out.size} schools with reported data`
  );
  return out;
}

// --- Build per-school JSON -------------------------------------------------

type SchoolRestraint = Record<keyof Metrics, Record<Group, number>>;

const ALL_GROUPS: Group[] = [
  "total",
  "swd",
  "white",
  "black",
  "hispanic",
  "asian",
  "am_indian",
  "pacific_islander",
  "two_or_more",
];

function buildSchoolJson(
  groupMaps: Record<Group, Map<string, Metrics>>
): Map<string, SchoolRestraint> {
  const ids = new Set<string>();
  for (const g of ALL_GROUPS) {
    for (const k of groupMaps[g].keys()) ids.add(k);
  }

  const out = new Map<string, SchoolRestraint>();
  for (const id of ids) {
    const totalRow = groupMaps.total.get(id);
    if (!totalRow) continue; // need totals as the anchor
    const json = {} as SchoolRestraint;
    for (const m of METRIC_KEYS) {
      json[m] = {} as Record<Group, number>;
      for (const g of ALL_GROUPS) {
        const row = groupMaps[g].get(id);
        json[m][g] = row ? row[m] : 0;
      }
    }
    out.set(id, json);
  }
  return out;
}

// --- DB writes -------------------------------------------------------------

async function applyToSchools(byId: Map<string, SchoolRestraint>) {
  console.log(`\nWriting restraint JSON for ${byId.size} schools…`);
  await sql`UPDATE entities SET restraint = NULL WHERE entity_type = 'school'`;

  const ids: string[] = [];
  const json: string[] = [];
  for (const [id, r] of byId) {
    ids.push(id);
    json.push(JSON.stringify(r));
  }

  await sql`
    UPDATE entities AS s
    SET restraint = u.r::jsonb,
        updated_at = now()
    FROM (
      SELECT
        unnest(${ids}::text[])  AS ncessch,
        unnest(${json}::text[]) AS r
    ) u
    WHERE s.entity_type = 'school' AND s.nces_id = u.ncessch
  `;
}

async function rollupToLeasAndSeas() {
  console.log(`\nRolling restraint up to LEAs…`);
  const buildJson = `
    jsonb_build_object(
      'mech_restraint',  jsonb_build_object(${groupSums("mech_restraint")}),
      'phys_restraint',  jsonb_build_object(${groupSums("phys_restraint")}),
      'seclusion',       jsonb_build_object(${groupSums("seclusion")})
    )
  `;

  await sql.unsafe(`
    UPDATE entities AS lea
    SET restraint = sub.r, updated_at = now()
    FROM (
      SELECT lea_id, ${buildJson} AS r
      FROM entities
      WHERE entity_type = 'school' AND restraint IS NOT NULL
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea' AND lea.nces_id = sub.lea_id
  `);

  console.log(`Rolling restraint up to SEAs…`);
  await sql.unsafe(`
    UPDATE entities AS sea
    SET restraint = sub.r, updated_at = now()
    FROM (
      SELECT sea_id, ${buildJson.replace(/restraint IS NOT NULL/, "restraint IS NOT NULL AND sea_id IS NOT NULL")} AS r
      FROM entities
      WHERE entity_type = 'lea' AND restraint IS NOT NULL AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `);
}

function groupSums(metric: string): string {
  return ALL_GROUPS.map(
    (g) =>
      `'${g}', COALESCE(SUM((restraint->'${metric}'->>'${g}')::int), 0)`
  ).join(", ");
}

// --- Main ------------------------------------------------------------------

async function main() {
  const groupMaps: Record<Group, Map<string, Metrics>> = {} as Record<
    Group,
    Map<string, Metrics>
  >;
  for (const g of ALL_GROUPS) {
    groupMaps[g] = await fetchGroup(g);
  }

  const byId = buildSchoolJson(groupMaps);
  await applyToSchools(byId);
  await rollupToLeasAndSeas();

  const summary = await sql<
    Array<{ entity_type: string; total: number; with_r: number }>
  >`
    SELECT entity_type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE restraint IS NOT NULL)::int AS with_r
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nRestraint coverage:`);
  for (const r of summary) {
    console.log(`  ${r.entity_type}: ${r.with_r}/${r.total}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
