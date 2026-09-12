import { defineConfig, devices } from '@playwright/test';

/**
 * ════════════════════════════════════════════════════════════════
 * بوت المتصفح — `npm run e2e`
 *
 * بيشغّل اللوحتين فعليًا (أدمن 3100 + معارض 3200) وبيتصرف
 * كمستخدم حقيقي: بيفتح كل صفحة، بيدوس، بيكتب، بيقلّب صفحات،
 * بيزايد، وبيصوّر سكرينشوتس — وبيراقب الكونسول والهيدرز طول الوقت.
 *
 * المشاريع:
 *   · desktop — كل الاختبارات الوظيفية والأمنية (1440×900)
 *   · mobile  — نفس الجولة البصرية على موبايل (390×844)
 *
 * السكرينشوتس بتتحفظ في e2e/screenshots/ — راجعها بعينك بعد كل جولة.
 * ════════════════════════════════════════════════════════════════
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  workers: 2, // سيرفرين dev بيترجموا الصفحات عند أول طلب — أكتر من كده بيزاحم
  // أول زيارة لصفحة على سيرفر dev بارد ممكن تعدي المهلة — إعادة واحدة بتمتص
  // الرعشة دي، والتقرير بيعلّم الاختبار «flaky» فمفيش فشل حقيقي بيتغطى
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],

  use: {
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Pixel 7 = كروميوم بمقاس موبايل — مش محتاجين تنزيل WebKit كمان
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /visual\.spec\.ts/, // الجولة البصرية بس — الوظائف اتغطت على الديسكتوب
    },
  ],

  webServer: [
    {
      command: 'npm run dev:admin',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npm run dev:dealers',
      url: 'http://localhost:3200',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
