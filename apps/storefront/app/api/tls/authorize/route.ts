import { normalizeHostname } from "@yantresh/core";
import { createSqlClient } from "@yantresh/db";

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain");
  const hostname = normalizeHostname(domain ?? "");

  if (!hostname) {
    return new Response("missing domain", { status: 400 });
  }

  const sql = createSqlClient();

  try {
    // ponytail: direct SQL is enough for the one Caddy ask-path; move this into a
    // repository only when the domain model has more than a couple of read paths.
    const rows = await sql<{ ok: number }[]>`
      select 1 as ok
      from domain
      where hostname = ${hostname}
        and status = 'active'
      limit 1
    `;

    if (rows.length === 1) {
      return new Response("ok", { status: 200 });
    }

    return new Response("forbidden", { status: 403 });
  } catch {
    return new Response("unavailable", { status: 503 });
  } finally {
    await sql.end({ timeout: 1 });
  }
}
