export type DbEnv = {
  databaseUrl: string;
  secretMasterKey: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readDatabaseUrl(): string {
  return getRequiredEnv("DATABASE_URL");
}

export function readSecretMasterKey(): string {
  return getRequiredEnv("SECRET_MASTER_KEY");
}

export function readDbEnv(): DbEnv {
  return {
    databaseUrl: readDatabaseUrl(),
    secretMasterKey: readSecretMasterKey()
  };
}
