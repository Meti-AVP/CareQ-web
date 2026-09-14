import { test } from '@playwright/test';
import { ADMIN, DEALERS, open } from './helpers';

/**
 * الجولة البصرية — سكرينشوت كامل لكل شاشة في اللوحتين
 *
 * بتتشغّل على مشروعين: desktop (1440×900) وmobile (iPhone 14).
 * الصور بتتحفظ في e2e/screenshots/{project}/{app}-{name}.png —
 * افتحها وراجعها بعينك: دي أسرع طريقة تمسك بيها انحراف تصميم.
 *
 * داتا الموك مجمّدة الزمن (MOCK_NOW) فالصور شبه ثابتة بين الجولات.
 */

const SHOTS: Array<[string, string, string]> = [
  // [التطبيق, المسار, اسم الصورة] — كلها محتاجة جلسة (جاهزة من global-setup.ts)
  [ADMIN, '/', 'admin-overview'],
  [ADMIN, '/listings', 'admin-listings'],
  [ADMIN, '/users', 'admin-users'],
  [ADMIN, '/exhibitions', 'admin-exhibitions'],
  [ADMIN, '/exhibitions/requests', 'admin-requests'],
  [ADMIN, '/auctions', 'admin-auctions'],
  [ADMIN, '/sell-now', 'admin-sell-now'],
  [ADMIN, '/financing', 'admin-financing'],
  [ADMIN, '/audit', 'admin-audit'],
  [ADMIN, '/health', 'admin-health'],
  [DEALERS, '/', 'dealers-home'],
  [DEALERS, '/inventory', 'dealers-inventory'],
  [DEALERS, '/inventory/new', 'dealers-new-listing'],
  [DEALERS, '/inventory/bulk', 'dealers-bulk'],
  [DEALERS, '/auctions', 'dealers-auctions'],
  [DEALERS, '/auctions/mine', 'dealers-my-bids'],
  [DEALERS, '/leads', 'dealers-leads'],
  [DEALERS, '/billing', 'dealers-billing'],
  [DEALERS, '/contract', 'dealers-contract'],
  [DEALERS, '/profile', 'dealers-profile'],
  [DEALERS, '/apply', 'dealers-apply'],
  [DEALERS, '/apply/status', 'dealers-apply-status'],
];

/** شاشات الدخول — لازم تتصوّر من غير جلسة، غير كده هي محوّلة لـ/ (المرحلة ٢) */
const LOGIN_SHOTS: Array<[string, string, string]> = [
  [ADMIN, '/login', 'admin-login'],
  [DEALERS, '/login', 'dealers-login'],
];

async function shoot(page: Parameters<typeof open>[0], base: string, path: string, name: string, project: string) {
  await open(page, base + path);
  // الحركات الافتتاحية بتخلص في أقل من ثانيتين — بنستنى عشان صورة مستقرة
  await page.waitForTimeout(2200);
  await page.screenshot({
    path: `e2e/screenshots/${project}/${name}.png`,
    fullPage: true,
  });
}

for (const [base, path, name] of SHOTS) {
  test(`سكرينشوت: ${name}`, async ({ page }, testInfo) => {
    await shoot(page, base, path, name, testInfo.project.name);
  });
}

test.describe('سكرينشوت شاشات الدخول (من غير جلسة)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [base, path, name] of LOGIN_SHOTS) {
    test(`سكرينشوت: ${name}`, async ({ page }, testInfo) => {
      await shoot(page, base, path, name, testInfo.project.name);
    });
  }
});
