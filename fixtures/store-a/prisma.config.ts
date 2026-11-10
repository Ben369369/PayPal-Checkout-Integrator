import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local / .env itself; the Prisma CLI needs them loaded here.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
