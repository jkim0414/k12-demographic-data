import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function create() {
  // Accept whatever name the hosting provider chose. Vercel's Neon
  // integration exposes POSTGRES_URL / DATABASE_URL / POSTGRES_PRISMA_URL
  // etc.; we pick the first non-empty one.
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error(
      "No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in the environment."
    );
  }
  return postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    ssl: connectionString.includes("localhost") ? false : "require",
    // Neon / Vercel Postgres exposes a pgbouncer-style pooler that shares
    // connections across requests. pgbouncer doesn't support server-side
    // prepared statements, and after an `ALTER TABLE` the pooler's cached
    // query plans can drift from the new schema and raise
    // "cached plan must not change result type". Disabling prepared
    // statements sidesteps both issues; the per-query cost is negligible
    // at our QPS.
    prepare: false,
  });
}

// A Proxy that lazily constructs the real client on first use. This lets
// modules import `sql` at build time (e.g. during `next build`) without
// requiring DATABASE_URL to be set.
export const sql: ReturnType<typeof postgres> = new Proxy(
  function placeholder() {} as unknown as ReturnType<typeof postgres>,
  {
    apply(_t, _thisArg, argArray: unknown[]) {
      const client = (globalThis.__sql ??= create());
      // @ts-expect-error tagged template application
      return client(...argArray);
    },
    get(_t, prop) {
      const client = (globalThis.__sql ??= create());
      const value = Reflect.get(client, prop);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);
