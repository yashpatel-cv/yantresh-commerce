function readEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// ponytail: this worker does not start queues yet; Phase 5 replaces the placeholder
// with BullMQ processors once catalog import and inventory sync are in scope.
export function describeWorkerBoot() {
  return {
    service: "@yantresh/worker",
    phase: "0",
    databaseUrl: readEnv("DATABASE_URL"),
    redisUrl: readEnv("REDIS_URL")
  };
}

if (process.env.NODE_ENV !== "test") {
  process.stdout.write(`${JSON.stringify(describeWorkerBoot())}\n`);
}
