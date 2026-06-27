import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { readDatabaseUrl } from "./env.js";

export function createSqlClient(url = readDatabaseUrl()) {
  return postgres(url, {
    max: 1
  });
}

export function createDb(url = readDatabaseUrl()) {
  const sql = createSqlClient(url);

  return drizzle({
    client: sql
  });
}
