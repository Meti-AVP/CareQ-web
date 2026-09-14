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
  // realtime.spec.ts محتاج webServer مختلف تمامًا (mock-backend.mjs +
  // NEXT_PUBLIC_API_URL — تفاصيل playwright.realtime.config.ts) وبيفشل
  // هنا لأن كل سياق متصفح في وضع الموك الافتراضي معزول عن التاني
  // (مفيش حالة مشتركة). شغّله بـ`npm run e2e:realtime` بس.
  testIgnore: /realtime\.spec\.ts/,
  outputDir: './e2e/test-results',
  fullyParallel: true,
  // الحل الجذري لبطء/تضخّم الذاكرة (موثّق بالكامل في
  // reports/PHASE-5-BACKEND-READINESS.md): السبب مش عدد الـworkers —
  // السبب إن `next dev` بيترجم كل route عند أول طلب ويسيبها كاش في
  // الذاكرة (سلوك webpack dev mode الطبيعي). سيرفرين dev لوحدهم وصلوا
  // ٤+ جيجا رامات بعد تصفّح ٢٠+ شاشة، وعلى جهاز بـ١٦ جيجا كده الذاكرة
  // الحرة توصل ٢ جيجا بس والنظام كله (حتى أوامر بره المشروع) بيولّع.
  // الحل: `webServer` تحت بيبني وينفّذ نسخة إنتاجية (`next build` +
  // `next start`) بدل `dev` — سيرفر خفيف من الأساس، مفيش ترجمة عند
  // الطلب، مفيش تراكم ذاكرة. رجّعنا الـworkers لـ٢ بأمان بعد الحل ده.
  workers: 2,
  // أول زيارة لصفحة على سيرفر dev بارد ممكن تعدي المهلة — إعادة واحدة بتمتص
  // الرعشة دي، والتقرير بيعلّم الاختبار «flaky» فمفيش فشل حقيقي بيتغطى
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],

  // تسجيل دخول حقيقي مرة واحدة للوحتين (المرحلة ٢) — الكوكي المحفوظة
  // بتتحمّل تلقائي في كل اختبار جديد. اللي محتاج يبدأ من غير جلسة
  // بيعمل override بـ`test.use({ storageState: { cookies: [], origins: [] } })`.
  globalSetup: './e2e/global-setup.ts',

  use: {
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    storageState: 'e2e/.auth/state.json',
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

  // بناء إنتاجي ثم تشغيل — مش `dev` (شوف تعليق `workers` فوق لسبب القرار).
  // `reuseExistingServer: true` يعني لو سيرفر شغّال بالفعل على المنفذ ده
  // (من جولة سابقة في نفس الجلسة، أو `npm run start:admin` يدوي)، مفيش
  // إعادة بناء — أول جولة بس بتاخد وقت البناء (~دقيقتين لكل تطبيق،
  // بيحصلوا بالتوازي)، وبعدها كل تشغيل تاني فوري. مهلة أطول (٥ دقايق)
  // عشان تستوعب وقت البناء نفسه مش بس بدء التشغيل.
  webServer: [
    {
      command: 'npm run build:admin && npm run start:admin',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 300_000,
    },
    {
      command: 'npm run build:dealers && npm run start:dealers',
      url: 'http://localhost:3200',
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
