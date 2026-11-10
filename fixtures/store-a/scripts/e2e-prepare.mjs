// Creates a fresh, seeded SQLite database for end-to-end tests.
// Usage: DATABASE_URL=file:./prisma/e2e.db node scripts/e2e-prepare.mjs
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("file:")) {
  console.error("DATABASE_URL must be a file: URL");
  process.exit(1);
}
const file = url.replace(/^file:/, "");
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(file + suffix, { force: true });

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
run("pnpm exec prisma migrate deploy");
run("pnpm exec prisma db seed");
