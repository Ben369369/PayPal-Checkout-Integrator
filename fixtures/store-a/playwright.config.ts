import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL = "file:./prisma/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh DB, production build, then start.
    command: `node scripts/e2e-prepare.mjs && pnpm build && pnpm start -p ${PORT}`,
    url: E2E_BASE_URL,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: E2E_BASE_URL,
    },
  },
});
