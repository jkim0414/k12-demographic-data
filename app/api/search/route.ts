import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { Entity, SearchHit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/search?q=<query>&type=<sea|lea|school>&limit=20
// Returns the best candidates for an autocomplete: exact code match first,
// then trigram-ranked name matches.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const typeParam = req.nextUrl.searchParams.get("type");
  const type =
    typeParam === "sea" || typeParam === "lea" || typeParam === "school"
      ? typeParam
      : null;
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 20),
    50
  );

  if (!q) return NextResponse.json({ results: [] });

  // 1. Exact or prefix match on nces_id is authoritative.
  const codeHits = await sql<Entity[]>`
    SELECT * FROM entities
    WHERE (nces_id = ${q} OR nces_id LIKE ${q + "%"})
      AND (${type}::text IS NULL OR entity_type = ${type})
    ORDER BY nces_id = ${q} DESC, length(nces_id) ASC
    LIMIT ${limit}
  `;

  // 2. Fuzzy name match via pg_trgm. Prefer entities whose name contains the
  // query literally, then fall back to similarity ranking.
  const nameHits = await sql<Array<Entity & { similarity: number }>>`
    SELECT *, similarity(name, ${q}) AS similarity
    FROM entities
    WHERE (name % ${q} OR name ILIKE ${"%" + q + "%"})
      AND (${type}::text IS NULL OR entity_type = ${type})
    ORDER BY
      (name ILIKE ${q + "%"}) DESC,
      similarity(name, ${q}) DESC,
      length(name) ASC
    LIMIT ${limit}
  `;

  const seen = new Set<number>();
  const results: SearchHit[] = [];
  for (const e of codeHits) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    results.push({ ...e, match_kind: "code", similarity: 1 });
  }
  for (const e of nameHits) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const { similarity, ...rest } = e;
    results.push({ ...rest, match_kind: "name", similarity });
  }

  return NextResponse.json({ results: results.slice(0, limit) });
}
