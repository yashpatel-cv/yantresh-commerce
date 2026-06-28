import {
  listAdminDomains,
  listAdminFeatureFlags,
  listAdminTenants,
  listAdminThemes,
  type AdminDomainSummary,
  type AdminFeatureFlagSummary,
  type AdminTenantSummary,
  type AdminThemeSummary
} from "@yantresh/db";

export type ControlPlaneLoad<T> = {
  error: string | null;
  rows: T[];
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown control-plane error";
}

async function safeRows<T>(loader: () => Promise<T[]>): Promise<ControlPlaneLoad<T>> {
  try {
    return {
      error: null,
      rows: await loader()
    };
  } catch (error) {
    return {
      error: formatError(error),
      rows: []
    };
  }
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(parsed);
}

export function formatJsonInline(value: unknown): string {
  return JSON.stringify(value);
}

export async function loadTenantSummaries(): Promise<ControlPlaneLoad<AdminTenantSummary>> {
  return safeRows(() => listAdminTenants());
}

export async function loadDomainSummaries(): Promise<ControlPlaneLoad<AdminDomainSummary>> {
  return safeRows(() => listAdminDomains());
}

export async function loadThemeSummaries(): Promise<ControlPlaneLoad<AdminThemeSummary>> {
  return safeRows(() => listAdminThemes());
}

export async function loadFeatureFlagSummaries(): Promise<ControlPlaneLoad<AdminFeatureFlagSummary>> {
  return safeRows(() => listAdminFeatureFlags());
}
