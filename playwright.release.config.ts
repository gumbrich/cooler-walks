import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const origin = process.env.RELEASE_ORIGIN;
export default defineConfig({
  ...base,
  testMatch: '**/release.spec.ts',
  testIgnore: [],
  webServer: origin
    ? []
    : {
        command: 'npm run release:serve',
        url: 'http://127.0.0.1:4181',
        reuseExistingServer: true,
      },
  use: { ...base.use, baseURL: origin ?? 'http://127.0.0.1:4181' },
});
