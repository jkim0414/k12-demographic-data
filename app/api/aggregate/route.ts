import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { aggregate } from "@/lib/aggregate";
import { Entity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
});

// POST /api/aggregate
// Body: { ids: [1, 2, 3, ...] }
// Returns aggregated demographics plus the list of entities for display.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const rows = await sql<Entity[]>`
    SELECT * FROM entities WHERE id = ANY(${parsed.data.ids})
  `;

  return NextResponse.json({
    entities: rows,
    aggregate: aggregate(rows),
  });
}
