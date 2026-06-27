import { tenantConfigSchema, type TenantConfig } from "@yantresh/config-schema";

export type DomainStatus = "pending" | "verifying" | "active" | "error";

export type DomainRecord = {
  hostname: string;
  isPrimary: boolean;
  status: DomainStatus;
  tenantId: string;
};

export function normalizeHostname(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

export function parseTenantConfig(input: unknown): TenantConfig {
  return tenantConfigSchema.parse(input);
}

export function assertActiveDomain(
  record: DomainRecord | null | undefined,
  hostname: string
): DomainRecord {
  if (!record || record.status !== "active") {
    throw new Error(`Domain is not active: ${normalizeHostname(hostname)}`);
  }

  return record;
}
