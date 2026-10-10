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

const client = new SQL(databaseUrl);

export const db = drizzle({ client, schema });
export { schema };
