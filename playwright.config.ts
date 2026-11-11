import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 }, // first hit of a route compiles it in next dev
  use: { baseURL, channel: "chrome", launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) } }, // SLOWMO=800 npm run e2e -- --headed to watch
  webServer: { command: "npm run dev", url: `${baseURL}/ward`, reuseExistingServer: true, timeout: 120_000 },
});
