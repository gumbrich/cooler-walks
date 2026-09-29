import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/release.spec.ts',
  // Shared CI runners need more time for multiple software-rendered map captures.
  // Individual assertions retain the same limit, so stalled interactions still fail.
  timeout: process.env.CI ? 180000 : 90000,
  expect: { timeout: 45000 },
  reporter: process.env.CI ? 'line' : 'list',
  workers: 1,
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
    },
  },
});
