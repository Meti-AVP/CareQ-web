import { defineConfig, devices } from '@playwright/test';

/**
 * ════════════════════════════════════════════════════════════════
 * بوت المتصفح — `npm run e2e:realtime` (المرحلة ٦)
 *
 * ملف منفصل عن `playwright.config.ts` عمدًا — **مش جزء من `npm run e2e`
 * الافتراضي ولا `npm run verify`**. السبب: الاختبار ده محتاج تطبيق
 * `dealers` شغّال ضد باك اند حقيقي (`NEXT_PUBLIC_API_URL` بيتحط وقت
 * التشغيل، مش وقت البناء) عشان تابين منفصلين يشوفوا **نفس** حالة
 * المزاد ويتزامنوا عن طريق WebSocket حقيقي — ده مستحيل في وضع الموك
 * الافتراضي (كل تاب فيه نسخته في الذاكرة لوحده، مفيش مشاركة حالة).
 *
 * ده بالظبط سبب استخدام `next dev` هنا مش `next build && next start`
 * زي `playwright.config.ts`: ملف واحد، اختبار واحد، اختياري — مفيش
 * داعي لبناء إنتاجي كامل (~دقيقة) عشانه، وإبقاؤه منفصل عن السويت
 * الافتراضي يحافظ على الحل الجذري لبطء `npm run e2e` اللي اتعمل في
 * المرحلة ٥ (`reports/PHASE-5-BACKEND-READINESS.md`) — مفيش رجوع للبطء.
 *
 * شغّله: `npm run e2e:realtime`
 * ════════════════════════════════════════════════════════════════
 */
const MOCK_PORT = 4326;
const DEALERS_PORT = 3200;

export default defineConfig({
  testDir: './e2e',
  testMatch: /realtime\.spec\.ts/,
  outputDir: './e2e/test-results-realtime',
  fullyParallel: false, // اختبار واحد بيفتح تابين — التوازي مالوش لازمة هنا
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],

  use: {
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: `node scripts/mock-backend.mjs`,
      url: `http://localhost:${MOCK_PORT}/v1/catalog/makes`,
      env: { PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: 'npm run dev:dealers',
      url: `http://localhost:${DEALERS_PORT}`,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${MOCK_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
