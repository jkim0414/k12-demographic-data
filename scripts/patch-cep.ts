/**
 * Refetch CCD school directory for the given year and populate
 * cep_participating on each school. Then roll up to LEAs and SEAs as
 * "any descendant participates".
 *
 *   YEAR=2023 npm run db:patch:cep
 *
 * The CEP indicator is `lunch_program = 2` ("NSLP with Community
 * Eligibility Option"). The four `*_cedp` fields are NOT CEP flags —
 * they're grade-band-served indicators (elementary / middle / high /
 * ungraded), unrelated to the meal program.
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

function pickString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function isCep(lunchProgram: unknown): boolean {
  // CCD lunch_program = 2 is "NSLP with Community Eligibility Option".
  if (lunchProgram == null) return false;
  return Number(lunchProgram) === 2;
}

async function main() {
  console.log(`Fetching CCD school directory for ${YEAR}…`);
  const rows = await fetchPaginated(
    `/schools/ccd/directory/${YEAR}/?per_page=${PAGE_SIZE}`
  );

  const ncessch: string[] = [];
  // postgres.js doesn't bind JS booleans into ::boolean[] cleanly, so
  // we ship 0/1 ints and cast back inside SQL.
  const cep: number[] = [];
  for (const r of rows) {
    const id = pickString(r.ncessch);
    if (!id) continue;
    ncessch.push(id);
    cep.push(isCep(r.lunch_program) ? 1 : 0);
  }

  console.log(`Updating ${ncessch.length} schools…`);
  await sql`
    UPDATE entities AS s
    SET cep_participating = (u.cep = 1), updated_at = now()
    FROM (
      SELECT
        unnest(${ncessch}::text[])    AS ncessch,
        unnest(${cep}::int[])         AS cep
    ) u
    WHERE s.entity_type = 'school' AND s.nces_id = u.ncessch
  `;

  console.log(`Rolling up to LEAs (any school is CEP)…`);
  await sql`
    UPDATE entities AS lea
    SET cep_participating = sub.any_cep, updated_at = now()
    FROM (
      SELECT lea_id, BOOL_OR(cep_participating) AS any_cep
      FROM entities WHERE entity_type = 'school'
      GROUP BY lea_id
    ) sub
    WHERE lea.entity_type = 'lea' AND lea.nces_id = sub.lea_id
  `;

  console.log(`Rolling up to SEAs (any LEA is CEP)…`);
  await sql`
    UPDATE entities AS sea
    SET cep_participating = sub.any_cep, updated_at = now()
    FROM (
      SELECT sea_id, BOOL_OR(cep_participating) AS any_cep
      FROM entities
      WHERE entity_type = 'lea' AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;

  const summary = await sql<
    Array<{ entity_type: string; total: number; cep: number }>
  >`
    SELECT entity_type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE cep_participating IS TRUE)::int AS cep
    FROM entities GROUP BY entity_type ORDER BY entity_type
  `;
  console.log(`\nCEP coverage:`);
  for (const r of summary) {
    console.log(`  ${r.entity_type}: ${r.cep}/${r.total} CEP`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
