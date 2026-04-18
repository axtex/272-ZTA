import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// Prisma CLI (migrations) must use a direct/session connection when using Supabase pooling.
const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL is not set in .env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});