import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',workers:1,fullyParallel:false,retries:0,timeout:60000,
  expect:{ timeout:15000 },reporter:'list',
  use:{ baseURL:'http://127.0.0.1:5012',timezoneId:'Asia/Shanghai',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',viewport:{ width:1440,height:1000 } },
  webServer:{ command:'pnpm exec tsx scripts/dev-all.ts --local-test --browser-test',url:'http://127.0.0.1:5012/api/knowledge/decision-catalog',timeout:240000,reuseExistingServer:false,gracefulShutdown:{ signal:'SIGTERM',timeout:10000 },
    env:{ DEPLOY_RUN_PORT:'5012',BACKEND_PORT:'8002',DECISION_BACKEND_URL:'http://127.0.0.1:8002',DECISION_LOCAL_TEST_PATH:'.local/d1-browser',DECISION_DATA_SOURCE:'local-test' },stdout:'pipe',stderr:'pipe' },
});
