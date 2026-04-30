/**
 * Layer CRDC discipline counts onto schools, then roll up to LEAs and SEAs.
 *
 *   YEAR=2021 npm run db:ingest:discipline
 *
 * Five headline metrics per entity:
 *   in_school_susp         students_susp_in_sch
 *   out_school_susp        students_susp_out_sch_single + students_susp_out_sch_multiple
 *   expulsion              expulsions_no_ed_serv + expulsions_with_ed_serv
 *                          (zero_tolerance is a subset of the above; not added)
 *   law_enforcement_ref    students_referred_law_enforce
 *   arrest                 students_arrested
 *
 * For each metric we collect 9 group counts:
 *   total, swd, white, black, hispanic, asian, am_indian,
 *   pacific_islander, two_or_more
 *
 * Achieved with 9 calls to the discipline/disability/race/sex/ endpoint,
 * each pinning four of the five facet dimensions to specific values and
 * leaving the fifth as a per-school slice.
 *
 * Stored as JSONB on entities.discipline. Aggregation happens in JS at
 * query time (we fetch entity rows and sum), so JSONB is preferable here
 * to a 50-column flat schema.
 */

import { sql } from "../lib/db";

const YEAR = process.env.YEAR ?? "2021";
const PAGE_SIZE = 1000;
const BASE = "https://educationdata.urban.org/api/v1";
const ENDPOINT = `/schools/crdc/discipline/${YEAR}/disability/race/sex/`;

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

// CRDC sentinel values: -1 = not applicable, -2 = suppressed. Treat both
// as null. Strings come through as numeric strings ("488") and as
// negative-value strings ("-2.000") so we coerce.
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type Metrics = {
  in_school_susp: number;
  out_school_susp: number;
  expulsion: number;
  law_enforcement_ref: number;
  arrest: number;
};

const METRIC_KEYS: (keyof Metrics)[] = [
  "in_school_susp",
  "out_school_susp",
  "expulsion",
  "law_enforcement_ref",
  "arrest",
];

function rowToMetrics(r: Row): Metrics {
  // null + n = null; we want suppressed counts to read as 0 in the
  // computed metric. CRDC suppression on individual sub-counts is rare
  // for the headline fields, but defensively coerce.
  const n = (k: string) => toNum(r[k]) ?? 0;
  return {
    in_school_susp: n("students_susp_in_sch"),
    out_school_susp:
      n("students_susp_out_sch_single") + n("students_susp_out_sch_multiple"),
    expulsion: n("expulsions_no_ed_serv") + n("expulsions_with_ed_serv"),
    law_enforcement_ref: n("students_referred_law_enforce"),
    arrest: n("students_arrested"),
  };
}

// Whether the row has any reported (non-suppressed) discipline data.
// We use this to decide whether a school had coverage at all for a
// given group, so the UI can distinguish "0 incidents reported" from
// "data was suppressed".
function rowHasReporting(r: Row): boolean {
  const fields = [
    "students_susp_in_sch",
    "students_susp_out_sch_single",
    "students_susp_out_sch_multiple",
    "expulsions_no_ed_serv",
    "expulsions_with_ed_serv",
    "students_referred_law_enforce",
    "students_arrested",
  ];
  return fields.some((f) => toNum(r[f]) != null);
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
    // In the CRDC discipline endpoint, disability codes are:
    //   0 = no disability   1 = IDEA-served   2 = Section-504-only
    //   99 = total
    // (Note: this differs from the CRDC *enrollment* endpoint, where
    // 1 = IDEA-served as well — but lots of CRDC tables flip these
    // codes around, so always reconcile against a known school
    // before trusting one.)
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

type SchoolDiscipline = Record<keyof Metrics, Record<Group, number>>;

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
): Map<string, SchoolDiscipline> {
  // Union of all ncessch ids that appear in any group. A school appears
  // in `total` typically; absent groups (e.g. no Black students at this
  // school) will map to 0 implicitly.
  const ids = new Set<string>();
  for (const g of ALL_GROUPS) {
    for (const k of groupMaps[g].keys()) ids.add(k);
  }

  const out = new Map<string, SchoolDiscipline>();
  for (const id of ids) {
    const totalRow = groupMaps.total.get(id);
    if (!totalRow) continue; // need totals as the anchor; skip schools without
    const json = {} as SchoolDiscipline;
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

async function applyToSchools(byId: Map<string, SchoolDiscipline>) {
  console.log(`\nWriting discipline JSON for ${byId.size} schools…`);
  // Reset everything first so a school missing from the new release goes
  // null, not stale.
  await sql`UPDATE entities SET discipline = NULL WHERE entity_type = 'school'`;

  const ids: string[] = [];
  const json: string[] = [];
  for (const [id, disc] of byId) {
    ids.push(id);
    json.push(JSON.stringify(disc));
  }

  await sql`
    UPDATE entities AS s
    SET discipline = u.disc::jsonb,
        updated_at = now()
    FROM (
      SELECT
        unnest(${ids}::text[])  AS ncessch,
        unnest(${json}::text[]) AS disc
    ) u
    WHERE s.entity_type = 'school' AND s.nces_id = u.ncessch
  `;
}

// Roll a JSON object up by summing numeric leaves across rows.
async function rollupToLeasAndSeas() {
  console.log(`\nRolling discipline up to LEAs…`);
  // Postgres has no built-in JSON-sum; build a SQL aggregate that walks
  // the metric × group keys we know about and sums each.
  const buildJson = `
    jsonb_build_object(
      'in_school_susp',      jsonb_build_object(${groupSums("in_school_susp")}),
      'out_school_susp',     jsonb_build_object(${groupSums("out_school_susp")}),
      'expulsion',           jsonb_build_object(${groupSums("expulsion")}),
      'law_enforcement_ref', jsonb_build_object(${groupSums("law_enforcement_ref")}),
      'arrest',              jsonb_build_object(${groupSums("arrest")})
    )
  `;

  await sql.unsafe(`
    UPDATE entities AS lea
    SET discipline = sub.disc, updated_at = now()
    FROM (
      SELECT lea_id, ${buildJson} AS disc
      FROM entities
      WHERE entity_type = 'school' AND discipline IS NOT NULL
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea' AND lea.nces_id = sub.lea_id
  `);

  console.log(`Rolling discipline up to SEAs…`);
  await sql.unsafe(`
    UPDATE entities AS sea
    SET discipline = sub.disc, updated_at = now()
    FROM (
      SELECT sea_id, ${buildJson.replace(/discipline IS NOT NULL/, "discipline IS NOT NULL AND sea_id IS NOT NULL")} AS disc
      FROM entities
      WHERE entity_type = 'lea' AND discipline IS NOT NULL AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `);
}

function groupSums(metric: string): string {
  return ALL_GROUPS.map(
    (g) =>
      `'${g}', COALESCE(SUM((discipline->'${metric}'->>'${g}')::int), 0)`
  ).join(", ");
}

// --- Main ------------------------------------------------------------------

async function main() {
  // Fetch sequentially so we don't hammer the API. Could parallelize 2-3
  // at a time if needed; keeping it simple for now.
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
    Array<{ entity_type: string; total: number; with_disc: number }>
  >`
    SELECT entity_type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE discipline IS NOT NULL)::int AS with_disc
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nDiscipline coverage:`);
  for (const r of summary) {
    console.log(`  ${r.entity_type}: ${r.with_disc}/${r.total}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
