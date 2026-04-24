import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "../lib/db";

async function main() {
  const ddl = readFileSync(resolve("scripts/schema.sql"), "utf8");
  await sql.unsafe(ddl);
  console.log("schema applied");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
