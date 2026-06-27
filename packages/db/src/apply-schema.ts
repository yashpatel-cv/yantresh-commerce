import { readFileSync } from "node:fs";

import postgres from "postgres";

import { readDatabaseUrl } from "./env.js";
import { packagedControlPlaneSqlPath } from "./sql.js";

export async function applySchema() {
  const sql = postgres(readDatabaseUrl(), { max: 1 });
  const ddl = readFileSync(packagedControlPlaneSqlPath, "utf8");

  try {
    await sql.unsafe(ddl);
    process.stdout.write('{"ok":true,"schema":"applied"}\n');
  } finally {
    await sql.end({ timeout: 1 });
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  applySchema().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown schema apply failure";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
