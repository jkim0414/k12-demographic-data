/**
 * Rename existing SEA entities in place using the FIPS → state-name table.
 *
 *   DATABASE_URL=... npm run db:rename-seas
 *
 * Ingests set `name` going forward; this lets you apply the rename to an
 * existing DB without re-running the full 45-minute ingest.
 */

import { sql } from "../lib/db";
import { STATE_NAMES, seaNameFromFips } from "../lib/states";

async function main() {
  const fipsCodes = Object.keys(STATE_NAMES);
  const names = fipsCodes.map((f) => seaNameFromFips(f));

  const result = await sql`
    UPDATE entities AS e
    SET name = m.name, updated_at = now()
    FROM (
      SELECT
        unnest(${fipsCodes}::text[]) AS fips,
        unnest(${names}::text[])     AS name
    ) AS m
    WHERE e.entity_type = 'sea' AND e.nces_id = m.fips
    RETURNING e.nces_id, e.name
  `;

  console.log(`Renamed ${result.length} SEAs:`);
  for (const r of result.slice(0, 5)) {
    console.log(`  ${r.nces_id}: ${r.name}`);
  }
  if (result.length > 5) console.log(`  … and ${result.length - 5} more`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
