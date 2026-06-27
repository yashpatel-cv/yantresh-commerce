/* =============================================================================
 * Yantresh Commerce — Core Contracts
 * Tenant config types + Zod validation + Plugin SDK interfaces.
 *
 * This file is the runtime contract that both the shared storefront and the
 * generator depend on. It mirrors schema.sql:
 *   - Zod schemas validate the JSONB columns (tenant.about, theme.tokens,
 *     tenant_plugin.config, catalog_source.config, homepage_block.config).
 *   - The Plugin interface is what every package under packages/plugins/* implements.
 *
 * Dependencies (peer): zod. React/Medusa types are referenced loosely so this
 * file stays close to drop-in; tighten them against your installed versions.
 * ========================================================================== */

import { z } from "zod";
import type { ComponentType } from "react";

/* ───────────────────────────── 1. Primitives ───────────────────────────── */

export type UUID = string;
export type CurrencyCode = string; // ISO-4217, validated below

/** A reference to a secret in the `secret` table. Never a plaintext value. */
export type SecretRef = `secret:${string}`;
export const secretRef = z
  .string()
  .regex(/^secret:[a-z0-9_.-]+$/i)
  .transform((s) => s as SecretRef);

export const currencyCode = z.string().length(3).toUpperCase();

/* ─────────────────────────── 2. Tenant config ──────────────────────────── */

export const aboutSchema = z.object({
  tagline: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
  hours: z.record(z.string(), z.string()).optional(), // { mon: "9-18", ... }
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      region: z.string().optional(),
      postal: z.string().optional(),
      country: z.string().length(2),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
    })
    .optional(),
  socials: z.record(z.string(), z.string().url()).optional(),
});
export type About = z.infer<typeof aboutSchema>;

export const themeTokensSchema = z.object({
  colors: z
    .object({
      primary: z.string(),
      onPrimary: z.string().optional(),
      bg: z.string().optional(),
      fg: z.string().optional(),
      accent: z.string().optional(),
      muted: z.string().optional(),
    })
    .partial()
    .extend({ primary: z.string() }),
  fonts: z
    .object({ heading: z.string().optional(), body: z.string().optional() })
    .optional(),
  radius: z.number().min(0).max(48).optional(),
  spacingScale: z.number().min(0.5).max(2).optional(),
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const deployModeSchema = z.enum(["shared_runtime", "generated_app"]);
export type DeployMode = z.infer<typeof deployModeSchema>;

/** The resolved, validated config a storefront process needs to render a tenant. */
export const tenantConfigSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string(),
  status: z.enum(["draft", "active", "suspended", "archived"]),
  deployMode: deployModeSchema,
  locale: z.string().default("en"),
  currencyCode: currencyCode.default("USD"),
  timezone: z.string().default("UTC"),
  about: aboutSchema.default({}),
  theme: z.object({
    preset: z.string().default("base"),
    tokens: themeTokensSchema,
    logoUrl: z.string().url().optional(),
  }),
  domains: z.array(z.object({ hostname: z.string(), isPrimary: z.boolean() })),
  // Medusa binding (soft multi-tenant): the storefront talks to Medusa with this key.
  commerce: z.object({
    salesChannelId: z.string(),
    regionId: z.string(),
    publishableKeyRef: secretRef,
  }),
  // Which plugins are on, in order, with their (non-secret) config.
  plugins: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean(),
      position: z.number().int().default(0),
      config: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
  flags: z.record(z.string(), z.unknown()).default({}),
  configVersion: z.number().int().default(1),
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/* ──────────────────── 3. Catalog source config (per kind) ───────────────── */

const fieldMap = z.record(z.string(), z.string()); // sourceColumn -> canonicalField

export const catalogSourceConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("google_sheet"),
    sheetId: z.string(),
    range: z.string().default("A1:Z"),
    secretRef: secretRef.optional(), // service-account key ref
    fieldMap,
  }),
  z.object({
    kind: z.literal("csv"),
    url: z.string().url(),
    delimiter: z.string().default(","),
    fieldMap,
  }),
  z.object({
    kind: z.literal("pos"),
    baseUrl: z.string().url(),
    secretRef, // POS API token ref (required)
    vendor: z.enum(["square", "clover", "generic"]).default("generic"),
    fieldMap,
  }),
  z.object({
    kind: z.literal("http_api"),
    baseUrl: z.string().url(),
    secretRef: secretRef.optional(),
    jsonPath: z.string().default("$"),
    fieldMap,
  }),
  z.object({ kind: z.literal("medusa_native") }),
]);
export type CatalogSourceConfig = z.infer<typeof catalogSourceConfigSchema>;

/** Canonical product shape produced by any catalog-source plugin. */
export const canonicalProductSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().int().nonnegative(), // minor units
  priceCurrency: currencyCode,
  inventoryQty: z.number().int().nonnegative().optional(),
  imageUrls: z.array(z.string().url()).default([]),
  attributes: z.record(z.string(), z.unknown()).default({}),
});
export type CanonicalProduct = z.infer<typeof canonicalProductSchema>;

/* ─────────────────────────── 4. Plugin SDK ─────────────────────────────── */

export type PluginKind =
  | "payment"
  | "delivery"
  | "pickup"
  | "loyalty"
  | "coupon"
  | "catalog_source"
  | "inventory_sync"
  | "layout_module"
  | "analytics"
  | "notification";

/** Capabilities are the typed contract a plugin advertises and others depend on. */
export type Capability =
  | "cart"
  | "order"
  | "payment.authorize"
  | "payment.capture"
  | "payment.refund"
  | "fulfillment.quote"
  | "fulfillment.create"
  | "promotion.apply"
  | "loyalty.accrue"
  | "loyalty.redeem"
  | "catalog.pull"
  | "inventory.pull"
  | "inventory.push"
  | "layout.block";

/**
 * Per-request context handed to every plugin hook. Tenant-scoped and least-priv:
 * `secrets.get` is the ONLY way to read a secret, and it is resolved server-side
 * for the current tenant — plugins never see another tenant's secrets or raw env.
 */
export interface PluginContext<TConfig = Record<string, unknown>> {
  readonly tenant: Pick<TenantConfig, "id" | "slug" | "currencyCode" | "locale">;
  readonly config: TConfig; // already Zod-validated against the plugin's schema
  readonly logger: { info(o: object, m?: string): void; error(o: object, m?: string): void };
  /** Resolve a secret for THIS tenant only. Throws if the ref is not owned by the tenant. */
  readonly secrets: { get(ref: SecretRef): Promise<string> };
  /** Scoped Medusa client (pinned to the tenant's sales channel + publishable key). */
  readonly commerce: CommerceClient;
  /** Per-tenant cache namespace (Redis-backed in prod, in-memory in dev). */
  readonly cache: { get<T>(k: string): Promise<T | null>; set(k: string, v: unknown, ttlSec?: number): Promise<void> };
}

/** Minimal commerce surface plugins are allowed to touch (wraps Medusa). */
export interface CommerceClient {
  getCart(cartId: string): Promise<unknown>;
  addPromotion(cartId: string, code: string): Promise<unknown>;
  createOrder(cartId: string): Promise<unknown>;
}

/** Untrusted boundary: every value returned by a plugin to the host is fenced.
 * The host validates `data` against `schema` before use and strips anything else. */
export interface FencedResult<T> {
  ok: boolean;
  data?: T;
  errors?: string[];
}

/**
 * The contract EVERY plugin implements. `configSchema` is the single source of
 * truth for the admin form, the JSONB validation, and the generator's typing.
 */
export interface Plugin<TConfig = Record<string, unknown>> {
  readonly key: string; // 'payment-stripe'
  readonly kind: PluginKind;
  readonly version: string; // semver
  readonly provides: Capability[];
  readonly requires: Capability[]; // host refuses to enable if unmet
  readonly secretKeys: string[]; // names expected in `secret` for this tenant
  readonly configSchema: z.ZodTypeAny;

  /** Called once at host boot (per process). Register routes/jobs/slots here. */
  register?(host: PluginHost): void | Promise<void>;
  /** Called per tenant when the plugin is enabled/config changes. */
  init?(ctx: PluginContext<TConfig>): void | Promise<void>;
  /** Liveness/readiness for the admin "test connection" button. */
  healthcheck?(ctx: PluginContext<TConfig>): Promise<FencedResult<{ status: "ok" | "degraded" }>>;
}

/** What the host exposes to plugins at registration time (extension points). */
export interface PluginHost {
  /** Mount a storefront UI block into a named slot (home/header/checkout/...). */
  addSlot(slot: SlotName, component: SlotComponent): void;
  /** Mount a server route under /api/plugins/<key>/* (signed, tenant-scoped). */
  addRoute(method: "GET" | "POST", path: string, handler: RouteHandler): void;
  /** Register a background job (cron or queue worker). */
  addJob(name: string, schedule: string | "queue", handler: JobHandler): void;
  /** Subscribe to a domain event (e.g. 'order.placed' -> loyalty accrual). */
  on(event: DomainEvent, handler: EventHandler): void;
}

export type SlotName =
  | "home.hero"
  | "home.body"
  | "header.nav"
  | "product.detail"
  | "checkout.payment"
  | "checkout.fulfillment"
  | "footer";

export type SlotComponent = ComponentType<{ ctx: PluginContext; props: Record<string, unknown> }>;
export type RouteHandler = (req: Request, ctx: PluginContext) => Promise<Response>;
export type JobHandler = (ctx: PluginContext) => Promise<void>;
export type DomainEvent = "cart.updated" | "order.placed" | "payment.captured" | "catalog.synced";
export type EventHandler = (payload: unknown, ctx: PluginContext) => Promise<void>;

/* ───────────────── 5. Specialized plugin sub-interfaces ─────────────────── */

export interface PaymentPlugin<TConfig = Record<string, unknown>> extends Plugin<TConfig> {
  kind: "payment";
  authorize(amount: number, currency: CurrencyCode, ctx: PluginContext<TConfig>): Promise<FencedResult<{ intentId: string }>>;
  capture(intentId: string, ctx: PluginContext<TConfig>): Promise<FencedResult<{ captured: boolean }>>;
  refund(intentId: string, amount: number, ctx: PluginContext<TConfig>): Promise<FencedResult<{ refunded: boolean }>>;
}

export interface CatalogSourcePlugin<TConfig = CatalogSourceConfig> extends Plugin<TConfig> {
  kind: "catalog_source";
  /** Pull raw rows, map via config.fieldMap, return canonical products.
   * The host rejects any row that fails canonicalProductSchema (untrusted input). */
  pull(ctx: PluginContext<TConfig>): Promise<FencedResult<CanonicalProduct[]>>;
}

export interface FulfillmentPlugin<TConfig = Record<string, unknown>> extends Plugin<TConfig> {
  kind: "delivery" | "pickup";
  quote(cartId: string, ctx: PluginContext<TConfig>): Promise<FencedResult<{ amount: number; etaMinutes?: number }>>;
}

/* ─────────────────────── 6. Feature-flag resolution ─────────────────────── */

export type FlagValue = boolean | string | number | Record<string, unknown>;

/** Resolution precedence (highest first):
 * 1. tenant_plugin.is_enabled (a feature gated by a plugin is off if the plugin is off)
 * 2. feature_flag where tenant_id = tenant (per-tenant override + rollout_pct)
 * 3. feature_flag where tenant_id IS NULL (platform default)
 * 4. code default
 */
export interface FlagResolver {
  isEnabled(key: string, fallback?: boolean): boolean;
  value<T extends FlagValue>(key: string, fallback: T): T;
}

/* ───────────────────────── 7. Plugin registry ──────────────────────────── */

/** Built at boot from packages/plugins/* (shared runtime) OR from the generated
 * plugins.generated.ts (per-client app). Same shape, different population path. */
export interface PluginRegistry {
  all(): Plugin[];
  byKey(key: string): Plugin | undefined;
  forTenant(cfg: TenantConfig): Plugin[]; // only enabled + dependency-satisfied
  assertDependencies(cfg: TenantConfig): void; // throws on unmet `requires`
}
