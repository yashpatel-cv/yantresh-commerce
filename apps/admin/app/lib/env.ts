// Server-only: reads platform service addresses from the deploy environment.
// ponytail: no validation; add zod parse here if startup health-check is needed.
export function platformEnv() {
  return {
    shopAdmin: process.env.SHOP_ADMIN_ADDRESS ?? "",
    storefront: process.env.COMMERCE_STOREFRONT_ADDRESS ?? "",
    demoStore: process.env.DEMO_STORE_ADDRESS ?? "",
    shopApi: process.env.SHOP_API_ADDRESS ?? "",
    domain: process.env.DOMAIN ?? "",
  };
}
