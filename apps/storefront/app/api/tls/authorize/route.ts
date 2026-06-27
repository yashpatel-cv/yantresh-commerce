import { normalizeHostname } from "@yantresh/core";
import { findActiveDomainByHostname } from "@yantresh/db";

export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain");
  const hostname = normalizeHostname(domain ?? "");

  if (!hostname) {
    return new Response("missing domain", { status: 400 });
  }

  try {
    if (await findActiveDomainByHostname(hostname)) {
      return new Response("ok", { status: 200 });
    }

    return new Response("forbidden", { status: 403 });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
