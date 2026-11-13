import { defineConfig } from "@medusajs/framework/utils";

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "server"
      | "worker"
      | undefined,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET!,
      cookieSecret: process.env.COOKIE_SECRET!
    }
  },
  admin: {
    disable: process.env.MEDUSA_DISABLE_ADMIN === "true"
  }
});
