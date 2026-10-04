import { defineConfig } from "@playwright/test";

const port = process.env.TEST_PORT || "3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          args: process.env.PLAYWRIGHT_CHROMIUM_ARGS
            ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS)
            : ["--no-sandbox"],
        }
      : undefined,
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100",
    },
  },
});
