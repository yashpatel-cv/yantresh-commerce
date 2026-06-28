"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminDomain, updateAdminDomain } from "@yantresh/db";

import { platformEnv } from "../lib/env";

const DOMAINS_PAGE_PATH = "/domains";
const DOMAIN_STATUS = ["pending", "verifying", "active", "error"] as const;
// ponytail: keep tls_mode fail-closed to the hub modes we can honor today.
const TLS_MODE = ["auto", "manual"] as const;

type DomainStatus = (typeof DOMAIN_STATUS)[number];
type TlsMode = (typeof TLS_MODE)[number];

function normalizeHostname(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

function isValidHostname(hostname: string): boolean {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    hostname
  );
}

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function readChecked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function redirectWithMessage(kind: "error" | "success", message: string): never {
  redirect(`${DOMAINS_PAGE_PATH}?${kind}=${encodeURIComponent(message)}`);
}

function parseStatus(formData: FormData): DomainStatus {
  const status = readText(formData, "status");

  if (DOMAIN_STATUS.includes(status as DomainStatus)) {
    return status as DomainStatus;
  }

  throw new Error("Invalid domain status.");
}

function parseTlsMode(formData: FormData): TlsMode {
  const tlsMode = readText(formData, "tlsMode");

  if (TLS_MODE.includes(tlsMode as TlsMode)) {
    return tlsMode as TlsMode;
  }

  throw new Error("Invalid TLS mode.");
}

function assertAllowedHostname(hostname: string, isSubdomain: boolean): void {
  const env = platformEnv();
  const reservedHosts = [env.shopAdmin, env.storefront, env.shopApi]
    .map((value) => normalizeHostname(value))
    .filter(Boolean);

  if (reservedHosts.includes(hostname)) {
    throw new Error("Hostname is reserved for a platform service.");
  }

  const rootDomain = normalizeHostname(env.domain);

  if (isSubdomain && rootDomain) {
    if (!hostname.endsWith(`.${rootDomain}`)) {
      throw new Error("Platform subdomains must live under DOMAIN.");
    }

    if (hostname === rootDomain) {
      throw new Error("Platform subdomains must include a tenant label.");
    }
  }
}

function parseCreateInput(formData: FormData) {
  const tenantId = readText(formData, "tenantId");
  const hostname = normalizeHostname(readText(formData, "hostname"));
  const isSubdomain = readChecked(formData, "isSubdomain");

  if (!tenantId) {
    throw new Error("Tenant is required.");
  }

  if (!hostname || !isValidHostname(hostname)) {
    throw new Error("Enter a valid hostname.");
  }

  assertAllowedHostname(hostname, isSubdomain);

  return {
    tenantId,
    hostname,
    isPrimary: readChecked(formData, "isPrimary"),
    isSubdomain,
    status: parseStatus(formData),
    tlsMode: parseTlsMode(formData)
  };
}

function parseUpdateInput(formData: FormData) {
  const domainId = readText(formData, "domainId");
  const hostname = normalizeHostname(readText(formData, "hostname"));
  const isSubdomain = readChecked(formData, "isSubdomain");

  if (!domainId) {
    throw new Error("Domain id is required.");
  }

  if (!hostname || !isValidHostname(hostname)) {
    throw new Error("Enter a valid hostname.");
  }

  assertAllowedHostname(hostname, isSubdomain);

  return {
    domainId,
    input: {
      hostname,
      isPrimary: readChecked(formData, "isPrimary"),
      isSubdomain,
      status: parseStatus(formData),
      tlsMode: parseTlsMode(formData)
    }
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown domain write error.";
}

export async function createDomainAction(formData: FormData): Promise<void> {
  let input;

  try {
    input = parseCreateInput(formData);
    await createAdminDomain(input);
  } catch (error) {
    redirectWithMessage("error", formatError(error));
  }

  revalidatePath(DOMAINS_PAGE_PATH);
  redirectWithMessage("success", `Created ${input.hostname}.`);
}

export async function updateDomainAction(formData: FormData): Promise<void> {
  let payload;

  try {
    payload = parseUpdateInput(formData);
    await updateAdminDomain(payload.domainId, payload.input);
  } catch (error) {
    redirectWithMessage("error", formatError(error));
  }

  revalidatePath(DOMAINS_PAGE_PATH);
  redirectWithMessage("success", `Saved ${payload.input.hostname}.`);
}
