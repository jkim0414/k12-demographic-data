/**
 * Targeted patch: refetch the CCD LEA directory and update only the CCD-
 * owned staff columns (teachers_fte, staff_total_fte, counselors_fte) on
 * existing LEA rows. Leaves EL/SWD/demographics/enrollment/CRDC fields
 * alone. Then re-rolls SEA staff totals from the patched LEAs.
 *
 * Use this when the CCD directory values for staff columns drift out of
 * sync — for example, if a previous CRDC rollup overwrote LEA counselors
 * with the (older, school-aggregated) CRDC number.
 *
 *   YEAR=2023 npm run db:patch:ccd-lea-staff
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

async function main() {
  console.log(`Fetching CCD LEA directory for ${YEAR}…`);
  const rows = await fetchPaginated(
    `/school-districts/ccd/directory/${YEAR}/?per_page=${PAGE_SIZE}`
  );

  const leaid: string[] = [];
  const teachers: (number | null)[] = [];
  const staffTotal: (number | null)[] = [];
  const counselors: (number | null)[] = [];
  for (const r of rows) {
    const id = pickString(r.leaid);
    if (!id) continue;
    leaid.push(id);
    teachers.push(toFloat(r.teachers_total_fte));
    staffTotal.push(toFloat(r.staff_total_fte));
    counselors.push(toFloat(r.school_counselors_fte));
  }
  console.log(`Patching ${leaid.length} LEAs…`);

  await sql`
    UPDATE entities AS lea
    SET teachers_fte    = u.teachers,
        staff_total_fte = u.staff_total,
        counselors_fte  = u.counselors,
        updated_at      = now()
    FROM (
      SELECT
        unnest(${leaid}::text[])      AS leaid,
        unnest(${teachers}::real[])   AS teachers,
        unnest(${staffTotal}::real[]) AS staff_total,
        unnest(${counselors}::real[]) AS counselors
    ) u
    WHERE lea.entity_type = 'lea' AND lea.nces_id = u.leaid
  `;

  console.log(`Re-rolling SEA staff totals from LEAs…`);
  await sql`
    UPDATE entities AS sea
    SET teachers_fte    = sub.teachers_sum,
        staff_total_fte = sub.staff_total_sum,
        counselors_fte  = sub.counselors_sum,
        updated_at      = now()
    FROM (
      SELECT
        sea_id,
        SUM(teachers_fte)::real    AS teachers_sum,
        SUM(staff_total_fte)::real AS staff_total_sum,
        SUM(counselors_fte)::real  AS counselors_sum
      FROM entities
      WHERE entity_type = 'lea' AND sea_id IS NOT NULL
      GROUP BY sea_id
    ) sub
    WHERE sea.entity_type = 'sea' AND sea.nces_id = sub.sea_id
  `;

  const [{ lea_with_counselors }] = await sql<
    Array<{ lea_with_counselors: number }>
  >`
    SELECT COUNT(counselors_fte)::int AS lea_with_counselors
    FROM entities WHERE entity_type = 'lea'
  `;
  console.log(`Done. ${lea_with_counselors} LEAs now have counselors_fte.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
