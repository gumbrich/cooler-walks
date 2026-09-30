import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/release.spec.ts',
  // These multi-step scenarios calculate real routes and capture several WebGL views.
  // Use the same complete-flow budget locally and in CI; individual assertions
  // retain their 45-second limit, so stalled interactions still fail.
  timeout: 180000,
  expect: { timeout: 45000 },
  reporter: process.env.CI ? 'line' : 'list',
  workers: 1,
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    // Exercise the full Chromium compositor, matching normal Chrome's headless mode.
    // The separate headless shell stalled during WebGL captures on Linux CI.
    channel: 'chromium',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
});
