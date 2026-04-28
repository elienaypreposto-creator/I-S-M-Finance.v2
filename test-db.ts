import { db } from "./lib/db/src/index.ts";
import { sql } from "drizzle-orm";

async function test() {
  try {
    const result = await db.execute(sql`SELECT count(*) FROM lancamentos`);
    console.log("DB connection OK! Total records:", result.rows[0].count);
    process.exit(0);
  } catch (e) {
    console.error("DB connection failed:", e);
    process.exit(1);
  }
}

test();
