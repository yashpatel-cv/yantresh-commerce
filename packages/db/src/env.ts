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

export function readDbEnv(): DbEnv {
  return {
    databaseUrl: getRequiredEnv("DATABASE_URL"),
    secretMasterKey: getRequiredEnv("SECRET_MASTER_KEY")
  };
}
