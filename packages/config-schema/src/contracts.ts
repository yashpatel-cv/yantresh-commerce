/* =============================================================================
 * Yantresh Commerce — Core Contracts
 * Canonical source lives in docs/contracts.ts; keep this package copy aligned.
 * ========================================================================== */

import { z } from "zod";
import type { ComponentType } from "react";

export type UUID = string;
export type CurrencyCode = string;

export type SecretRef = `secret:${string}`;
export const secretRef = z
  .string()
  .regex(/^secret:[a-z0-9_.-]+$/i)
  .transform((s) => s as SecretRef);

export const currencyCode = z.string().length(3).toUpperCase();

export const aboutSchema = z.object({
  tagline: z.string().max(160).optional(),
  description: z.string().max(4000).optional(),
  hours: z.record(z.string(), z.string()).optional(),
  address: z
    .object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      region: z.string().optional(),
      postal: z.string().optional(),
      country: z.string().length(2)
    })
    .optional(),
  contact: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional()
    })
    .optional(),
  socials: z.record(z.string(), z.string().url()).optional()
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
      muted: z.string().optional()
    })
    .partial()
    .extend({ primary: z.string() }),
  fonts: z
    .object({ heading: z.string().optional(), body: z.string().optional() })
    .optional(),
  radius: z.number().min(0).max(48).optional(),
  spacingScale: z.number().min(0.5).max(2).optional()
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const deployModeSchema = z.enum(["shared_runtime", "generated_app"]);
export type DeployMode = z.infer<typeof deployModeSchema>;

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
    logoUrl: z.string().url().optional()
  }),
  domains: z.array(z.object({ hostname: z.string(), isPrimary: z.boolean() })),
  commerce: z.object({
    salesChannelId: z.string(),
    regionId: z.string(),
    publishableKeyRef: secretRef
  }),
  plugins: z.array(
    z.object({
      key: z.string(),
      enabled: z.boolean(),
      position: z.number().int().default(0),
      config: z.record(z.string(), z.unknown()).default({})
    })
  ),
  flags: z.record(z.string(), z.unknown()).default({}),
  configVersion: z.number().int().default(1)
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

const fieldMap = z.record(z.string(), z.string());

export const catalogSourceConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("google_sheet"),
    sheetId: z.string(),
    range: z.string().default("A1:Z"),
    secretRef: secretRef.optional(),
    fieldMap
  }),
  z.object({
    kind: z.literal("csv"),
    url: z.string().url(),
    delimiter: z.string().default(","),
    fieldMap
  }),
  z.object({
    kind: z.literal("pos"),
    baseUrl: z.string().url(),
    secretRef,
    vendor: z.enum(["square", "clover", "generic"]).default("generic"),
    fieldMap
  }),
  z.object({
    kind: z.literal("http_api"),
    baseUrl: z.string().url(),
    secretRef: secretRef.optional(),
    jsonPath: z.string().default("$"),
    fieldMap
  }),
  z.object({ kind: z.literal("medusa_native") })
]);
export type CatalogSourceConfig = z.infer<typeof catalogSourceConfigSchema>;

export const canonicalProductSchema = z.object({
  externalId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().int().nonnegative(),
  priceCurrency: currencyCode,
  inventoryQty: z.number().int().nonnegative().optional(),
  imageUrls: z.array(z.string().url()).default([]),
  attributes: z.record(z.string(), z.unknown()).default({})
});
export type CanonicalProduct = z.infer<typeof canonicalProductSchema>;

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

export interface PluginContext<TConfig = Record<string, unknown>> {
  readonly tenant: Pick<TenantConfig, "id" | "slug" | "currencyCode" | "locale">;
  readonly config: TConfig;
  readonly logger: { info(o: object, m?: string): void; error(o: object, m?: string): void };
  readonly secrets: { get(ref: SecretRef): Promise<string> };
  readonly commerce: CommerceClient;
  readonly cache: {
    get<T>(k: string): Promise<T | null>;
    set(k: string, v: unknown, ttlSec?: number): Promise<void>;
  };
}

export interface CommerceClient {
  getCart(cartId: string): Promise<unknown>;
  addPromotion(cartId: string, code: string): Promise<unknown>;
  createOrder(cartId: string): Promise<unknown>;
}

export interface FencedResult<T> {
  ok: boolean;
  data?: T;
  errors?: string[];
}

export interface Plugin<TConfig = Record<string, unknown>> {
  readonly key: string;
  readonly kind: PluginKind;
  readonly version: string;
  readonly provides: Capability[];
  readonly requires: Capability[];
  readonly secretKeys: string[];
  readonly configSchema: z.ZodTypeAny;
  register?(host: PluginHost): void | Promise<void>;
  init?(ctx: PluginContext<TConfig>): void | Promise<void>;
  healthcheck?(ctx: PluginContext<TConfig>): Promise<FencedResult<{ status: "ok" | "degraded" }>>;
}

export interface PluginHost {
  addSlot(slot: SlotName, component: SlotComponent): void;
  addRoute(method: "GET" | "POST", path: string, handler: RouteHandler): void;
  addJob(name: string, schedule: string | "queue", handler: JobHandler): void;
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

export interface PaymentPlugin<TConfig = Record<string, unknown>> extends Plugin<TConfig> {
  kind: "payment";
  authorize(
    amount: number,
    currency: CurrencyCode,
    ctx: PluginContext<TConfig>
  ): Promise<FencedResult<{ intentId: string }>>;
  capture(intentId: string, ctx: PluginContext<TConfig>): Promise<FencedResult<{ captured: boolean }>>;
  refund(
    intentId: string,
    amount: number,
    ctx: PluginContext<TConfig>
  ): Promise<FencedResult<{ refunded: boolean }>>;
}

export interface CatalogSourcePlugin<TConfig = CatalogSourceConfig> extends Plugin<TConfig> {
  kind: "catalog_source";
  pull(ctx: PluginContext<TConfig>): Promise<FencedResult<CanonicalProduct[]>>;
}

export interface FulfillmentPlugin<TConfig = Record<string, unknown>> extends Plugin<TConfig> {
  kind: "delivery" | "pickup";
  quote(
    cartId: string,
    ctx: PluginContext<TConfig>
  ): Promise<FencedResult<{ amount: number; etaMinutes?: number }>>;
}

export type FlagValue = boolean | string | number | Record<string, unknown>;

export interface FlagResolver {
  isEnabled(key: string, fallback?: boolean): boolean;
  value<T extends FlagValue>(key: string, fallback: T): T;
}

export interface PluginRegistry {
  all(): Plugin[];
  byKey(key: string): Plugin | undefined;
  forTenant(cfg: TenantConfig): Plugin[];
  assertDependencies(cfg: TenantConfig): void;
}
