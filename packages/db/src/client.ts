import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { readDbEnv } from "./env.js";

export function createSqlClient(url = readDbEnv().databaseUrl) {
  return postgres(url, {
    max: 1
  });
}

export function createDb(url = readDbEnv().databaseUrl) {
  const sql = createSqlClient(url);

  return drizzle({
    client: sql
  });
}
