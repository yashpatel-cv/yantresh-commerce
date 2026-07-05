import { defineConfig } from "@medusajs/framework/config";

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "server"
      | "worker"
      | undefined
  },
  admin: {
    disable: Boolean(process.env.MEDUSA_DISABLE_ADMIN)
  }
});
