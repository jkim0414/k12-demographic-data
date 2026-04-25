/**
 * Layer Census ACS 5-year community demographics onto LEAs.
 *
 *   YEAR=2023 npm run db:ingest:acs
 *
 * Census publishes ACS 5-year estimates by school-district geography,
 * which lines up cleanly with NCES leaids: an NCES leaid is just
 * `state_fp.padStart(2, '0') + sd_code.padStart(5, '0')`. We pull race
 * (B03002) and median household income (B19013) for all three district
 * geographies — unified, elementary, and secondary — across all 50 states
 * + DC, then UPDATE matching LEAs and roll up totals to SEAs.
 *
 * No API key needed for the volume we issue (~150 calls). Add
 * CENSUS_API_KEY to the env if you ever hit the public-rate-limit cap.
 *
 * Variables (all from ACS 5-year, "ESTIMATE"):
 *   B03002_001E  Total population (Hispanic-or-Latino origin universe)
 *   B03002_003E  Not Hispanic / White alone
 *   B03002_004E  Not Hispanic / Black or African American alone
 *   B03002_005E  Not Hispanic / American Indian or Alaska Native alone
 *   B03002_006E  Not Hispanic / Asian alone
 *   B03002_007E  Not Hispanic / Native Hawaiian or Pacific Islander alone
 *   B03002_009E  Not Hispanic / Two or more races
 *   B03002_012E  Hispanic or Latino (any race)
 *   B19013_001E  Median household income (USD)
 *
 * Race buckets are mutually exclusive AND sum to total population, which
 * is the Census convention for racial-ethnic comparison. AIAN-alone-or-in-
 * combination, NHPI-alone-or-in-combination etc. are different denominators
 * we don't collect here.
 */

import { sql } from "../lib/db";

const YEAR = process.env.YEAR ?? "2023";
const API_KEY = process.env.CENSUS_API_KEY;
const BASE = `https://api.census.gov/data/${YEAR}/acs/acs5`;

const VARS = [
  "B03002_001E",
  "B03002_003E",
  "B03002_004E",
  "B03002_005E",
  "B03002_006E",
  "B03002_007E",
  "B03002_009E",
  "B03002_012E",
  "B19013_001E",
];

const STATE_FIPS = [
  "01", "02", "04", "05", "06", "08", "09", "10", "11", "12",
  "13", "15", "16", "17", "18", "19", "20", "21", "22", "23",
  "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
  "34", "35", "36", "37", "38", "39", "40", "41", "42", "44",
  "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56",
];

type SD_TYPE = "unified" | "elementary" | "secondary";

async function fetchAcs(stateFp: string, sdType: SD_TYPE) {
  const params = new URLSearchParams({
    get: VARS.join(","),
    for: `school district (${sdType}):*`,
    in: `state:${stateFp}`,
  });
  if (API_KEY) params.set("key", API_KEY);
  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (res.status === 204) return [];
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} on ${url}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text) as string[][];
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  // ACS uses negative sentinels (-666666666 etc.) for "not available".
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

type Patch = {
  nces_id: string;
  community_population_acs: number | null;
  community_white: number | null;
  community_black: number | null;
  community_am_indian: number | null;
  community_asian: number | null;
  community_pacific_islander: number | null;
  community_two_or_more: number | null;
  community_hispanic: number | null;
  median_household_income: number | null;
};

function rowToPatch(stateFp: string, header: string[], row: string[]): Patch | null {
  const idx = (k: string) => header.indexOf(k);
  const sdCol = header.find((h) => h.startsWith("school district"));
  if (!sdCol) return null;
  const sdCode = String(row[header.indexOf(sdCol)]).padStart(5, "0");
  const nces_id = `${stateFp.padStart(2, "0")}${sdCode}`;
  return {
    nces_id,
    community_population_acs: toInt(row[idx("B03002_001E")]),
    community_white: toInt(row[idx("B03002_003E")]),
    community_black: toInt(row[idx("B03002_004E")]),
    community_am_indian: toInt(row[idx("B03002_005E")]),
    community_asian: toInt(row[idx("B03002_006E")]),
    community_pacific_islander: toInt(row[idx("B03002_007E")]),
    community_two_or_more: toInt(row[idx("B03002_009E")]),
    community_hispanic: toInt(row[idx("B03002_012E")]),
    median_household_income: toInt(row[idx("B19013_001E")]),
  };
}

async function main() {
  const acsYear = `${Number(YEAR) - 4}-${YEAR}`; // 5-year window: e.g. "2019-2023"
  const patches: Patch[] = [];

  // Three district types per state. ACS only returns rows for whichever
  // type exists in a given state — most states are unified, some have
  // separate elementary/secondary (e.g., AZ, IL, NJ).
  for (const stateFp of STATE_FIPS) {
    for (const sdType of ["unified", "elementary", "secondary"] as SD_TYPE[]) {
      const rows = await fetchAcs(stateFp, sdType);
      if (rows.length <= 1) continue;
      const header = rows[0];
      for (let i = 1; i < rows.length; i++) {
        const p = rowToPatch(stateFp, header, rows[i]);
        if (p) patches.push(p);
      }
      process.stdout.write(`  state ${stateFp} ${sdType}: ${rows.length - 1} districts\r`);
    }
  }
  process.stdout.write("\n");

  console.log(`\nFetched ${patches.length} district rows from ACS.`);
  console.log(`Applying to LEAs…`);

  // Bulk update via unnest().
  const ids = patches.map((p) => p.nces_id);
  const pop = patches.map((p) => p.community_population_acs);
  const white = patches.map((p) => p.community_white);
  const black = patches.map((p) => p.community_black);
  const amInd = patches.map((p) => p.community_am_indian);
  const asian = patches.map((p) => p.community_asian);
  const pi = patches.map((p) => p.community_pacific_islander);
  const two = patches.map((p) => p.community_two_or_more);
  const hisp = patches.map((p) => p.community_hispanic);
  const income = patches.map((p) => p.median_household_income);

  await sql`
    UPDATE entities AS lea
    SET community_population_acs    = u.pop,
        community_white             = u.white,
        community_black             = u.black,
        community_am_indian         = u.am_ind,
        community_asian             = u.asian,
        community_pacific_islander  = u.pi,
        community_two_or_more       = u.two_or_more,
        community_hispanic          = u.hispanic,
        median_household_income     = u.income,
        acs_year                    = ${acsYear},
        updated_at                  = now()
    FROM (
      SELECT
        unnest(${ids}::text[])    AS leaid,
        unnest(${pop}::int[])     AS pop,
        unnest(${white}::int[])   AS white,
        unnest(${black}::int[])   AS black,
        unnest(${amInd}::int[])   AS am_ind,
        unnest(${asian}::int[])   AS asian,
        unnest(${pi}::int[])      AS pi,
        unnest(${two}::int[])     AS two_or_more,
        unnest(${hisp}::int[])    AS hispanic,
        unnest(${income}::int[])  AS income
    ) u
    WHERE lea.entity_type = 'lea' AND lea.nces_id = u.leaid
  `;

  console.log(`Rolling community race totals up to SEAs…`);
  await sql`
    UPDATE entities AS sea
    SET community_population_acs   = sub.pop,
        community_white            = sub.w,
        community_black            = sub.b,
        community_am_indian         = sub.ai,
        community_asian             = sub.a,
        community_pacific_islander  = sub.p,
        community_two_or_more       = sub.tm,
        community_hispanic          = sub.h,
        acs_year                    = ${acsYear},
        updated_at                  = now()
    FROM (
      SELECT
        sea_id,
        SUM(community_population_acs)::int   AS pop,
        SUM(community_white)::int            AS w,
        SUM(community_black)::int            AS b,
        SUM(community_am_indian)::int        AS ai,
        SUM(community_asian)::int            AS a,
        SUM(community_pacific_islander)::int AS p,
        SUM(community_two_or_more)::int      AS tm,
        SUM(community_hispanic)::int         AS h
      FROM entities
      WHERE entity_type = 'lea' AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;

  // Median income at SEA level: population-weighted average of LEA medians.
  // Not exact (true state median requires raw microdata), but a reasonable
  // summary for aggregating selected LEAs.
  await sql`
    UPDATE entities AS sea
    SET median_household_income = sub.weighted_income
    FROM (
      SELECT
        sea_id,
        (SUM(median_household_income::numeric * community_population_acs)
         / NULLIF(SUM(community_population_acs), 0))::int AS weighted_income
      FROM entities
      WHERE entity_type = 'lea'
        AND sea_id IS NOT NULL
        AND median_household_income IS NOT NULL
        AND community_population_acs IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;

  const summary = await sql<
    Array<{
      entity_type: string;
      total: number;
      with_race: number;
      with_income: number;
    }>
  >`
    SELECT entity_type,
           COUNT(*)::int                    AS total,
           COUNT(community_white)::int      AS with_race,
           COUNT(median_household_income)::int AS with_income
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nCoverage after ACS ingest:`);
  for (const r of summary) {
    console.log(
      `  ${r.entity_type}: ${r.total} total · race=${r.with_race} · income=${r.with_income}`
    );
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
