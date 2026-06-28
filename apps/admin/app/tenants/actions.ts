"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminTenant, updateAdminTenant, type AdminTenantWriteInput } from "@yantresh/db";

const TENANTS_PAGE_PATH = "/tenants";
const TENANT_STATUS = ["draft", "active", "suspended", "archived"] as const;
const DEPLOY_MODE = ["shared_runtime", "generated_app"] as const;

type TenantStatus = (typeof TENANT_STATUS)[number];
type DeployMode = (typeof DEPLOY_MODE)[number];

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullable(value: string): string | null {
  return value ? value : null;
}

function normalizeSecretRef(value: string): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/^secret:/i, "").trim();

  if (!/^[a-z0-9_.-]+$/i.test(normalized)) {
    throw new Error("Publishable key ref must use letters, numbers, dots, underscores, or dashes.");
  }

  return normalized;
}

function redirectWithMessage(kind: "error" | "success", message: string): never {
  redirect(`${TENANTS_PAGE_PATH}?${kind}=${encodeURIComponent(message)}`);
}

function parseStatus(formData: FormData): TenantStatus {
  const status = readText(formData, "status");

  if (TENANT_STATUS.includes(status as TenantStatus)) {
    return status as TenantStatus;
  }

  throw new Error("Invalid tenant status.");
}

function parseDeployMode(formData: FormData): DeployMode {
  const deployMode = readText(formData, "deployMode");

  if (DEPLOY_MODE.includes(deployMode as DeployMode)) {
    return deployMode as DeployMode;
  }

  throw new Error("Invalid deploy mode.");
}

function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug must use lowercase letters, numbers, and single dashes.");
  }
}

function assertValidLocale(locale: string): void {
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error("Locale must look like en or en-CA.");
  }
}

function assertValidCurrencyCode(currencyCode: string): void {
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Currency code must be a 3-letter ISO code.");
  }
}

function assertValidTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Timezone must be a valid IANA zone like UTC or America/Toronto.");
  }
}

function assertTextLimit(value: string, limit: number, label: string): void {
  if (value.length > limit) {
    throw new Error(`${label} must be ${limit} characters or fewer.`);
  }
}

function parseTenantInput(formData: FormData): AdminTenantWriteInput {
  const slug = readText(formData, "slug").toLowerCase();
  const displayName = readText(formData, "displayName");
  const legalName = readText(formData, "legalName");
  const locale = readText(formData, "locale");
  const currencyCode = readText(formData, "currencyCode").toUpperCase();
  const timezone = readText(formData, "timezone");
  const aboutTagline = readText(formData, "aboutTagline");
  const aboutDescription = readText(formData, "aboutDescription");
  const commerceSalesChannelId = readText(formData, "commerceSalesChannelId");
  const commerceRegionId = readText(formData, "commerceRegionId");

  if (!displayName) {
    throw new Error("Display name is required.");
  }

  assertValidSlug(slug);
  assertValidLocale(locale);
  assertValidCurrencyCode(currencyCode);
  assertValidTimezone(timezone);
  assertTextLimit(displayName, 120, "Display name");
  assertTextLimit(legalName, 160, "Legal name");
  assertTextLimit(aboutTagline, 160, "Tagline");
  assertTextLimit(aboutDescription, 4000, "Description");

  return {
    slug,
    legalName: normalizeNullable(legalName),
    displayName,
    status: parseStatus(formData),
    deployMode: parseDeployMode(formData),
    locale,
    currencyCode,
    timezone,
    aboutTagline: normalizeNullable(aboutTagline),
    aboutDescription: normalizeNullable(aboutDescription),
    commerceSalesChannelId: normalizeNullable(commerceSalesChannelId),
    commerceRegionId: normalizeNullable(commerceRegionId),
    commercePubKeyRef: normalizeSecretRef(readText(formData, "commercePubKeyRef"))
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown tenant write error.";
}

export async function createTenantAction(formData: FormData): Promise<void> {
  let input;

  try {
    input = parseTenantInput(formData);
    await createAdminTenant(input);
  } catch (error) {
    redirectWithMessage("error", formatError(error));
  }

  revalidatePath(TENANTS_PAGE_PATH);
  redirectWithMessage("success", `Created ${input.displayName}.`);
}

export async function updateTenantAction(formData: FormData): Promise<void> {
  const tenantId = readText(formData, "tenantId");
  let input;

  try {
    if (!tenantId) {
      throw new Error("Tenant id is required.");
    }

    input = parseTenantInput(formData);
    await updateAdminTenant(tenantId, input);
  } catch (error) {
    redirectWithMessage("error", formatError(error));
  }

  revalidatePath(TENANTS_PAGE_PATH);
  redirectWithMessage("success", `Saved ${input.displayName}.`);
}
