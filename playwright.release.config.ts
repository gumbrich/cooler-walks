import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base, {
  testMatch: '**/release.spec.ts',
  testIgnore: [],
  webServer: {
    command: 'npm run release:serve',
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: true,
  },
  use: { ...base.use, baseURL: 'http://127.0.0.1:4181' },
});
