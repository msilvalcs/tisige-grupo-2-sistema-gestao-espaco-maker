import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'npm start -w @siges/api',
      url: 'http://127.0.0.1:3101/api/health',
      env: { PORT: '3101' },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run dev -w @siges/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      env: { SIGES_API_TARGET: 'http://127.0.0.1:3101' },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
