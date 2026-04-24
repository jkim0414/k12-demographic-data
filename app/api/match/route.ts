import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { Entity, MatchResult, SearchHit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  queries: z
    .array(
      z.object({
        raw: z.string().min(1),
        code: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .max(5000),
});

// POST /api/match
// Body: { queries: [{ raw, code?, name? }, ...] }
// For each query, try exact nces_id match first (if `code` present or if
// `raw` is all digits), then fall back to trigram fuzzy matching on name.
// Returns the top 5 hits per query and auto-selects the top hit when
// confidence is high enough.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const results: MatchResult[] = [];

  for (const q of parsed.data.queries) {
    const raw = q.raw.trim();
    const code = (q.code ?? (looksLikeCode(raw) ? raw : "")).trim();
    const name = (q.name ?? (looksLikeCode(raw) ? "" : raw)).trim();

    const hits: SearchHit[] = [];

    if (code) {
      const codeRows = await sql<Entity[]>`
        SELECT * FROM entities WHERE nces_id = ${code} LIMIT 1
      `;
      for (const e of codeRows) {
        hits.push({ ...e, match_kind: "code", similarity: 1 });
      }
    }

    if (name && hits.length === 0) {
      const nameRows = await sql<Array<Entity & { similarity: number }>>`
        SELECT *, similarity(name, ${name}) AS similarity
        FROM entities
        WHERE name % ${name} OR name ILIKE ${"%" + name + "%"}
        ORDER BY
          (name ILIKE ${name + "%"}) DESC,
          similarity(name, ${name}) DESC,
          length(name) ASC
        LIMIT 5
      `;
      for (const e of nameRows) {
        const { similarity, ...rest } = e;
        hits.push({ ...rest, match_kind: "name", similarity });
      }
    }

    // Auto-select: exact code always wins; for names, require similarity >=
    // 0.5 AND either a clear gap over #2 (>= 0.15) or only one candidate.
    let chosen: SearchHit | null = null;
    if (hits.length > 0) {
      const top = hits[0];
      if (top.match_kind === "code") {
        chosen = top;
      } else if (top.similarity >= 0.5) {
        const gap = hits.length === 1 ? 1 : top.similarity - hits[1].similarity;
        if (hits.length === 1 || gap >= 0.15) chosen = top;
      }
    }

    results.push({ query: raw, hits, chosen });
  }

  return NextResponse.json({ results });
}

function looksLikeCode(s: string): boolean {
  // NCES IDs: SEA = 2 digit FIPS, LEA = 7 digit, school = 12 digit.
  return /^\d{2,12}$/.test(s.replace(/\s+/g, ""));
}
