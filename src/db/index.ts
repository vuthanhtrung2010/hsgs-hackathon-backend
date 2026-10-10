import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "❌ Fatal Error: DATABASE_URL environment variable is not defined. Application startup rejected.",
  );
  throw new Error("DATABASE_URL environment variable is required");
}

function sanitizeDatabaseUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete("schema");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const client = new SQL(sanitizeDatabaseUrl(databaseUrl));

export const db = drizzle({ client, schema });
export { schema };
