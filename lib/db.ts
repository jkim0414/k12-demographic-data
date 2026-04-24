import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }
  return postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    ssl: connectionString.includes("localhost") ? false : "require",
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
