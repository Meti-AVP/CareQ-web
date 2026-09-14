import { expect, test } from '@playwright/test';
import { ADMIN, DEALERS, expectCleanConsole, open, watchConsole } from './helpers';

/**
 * جلسة الدخول عبر اللوحتين (المرحلة ٢) — F5 بيحافظ على الجلسة، الخروج
 * بيقفل الوصول تاني، الوضع التجريبي واضح، وانتهاء الجلسة أثناء
 * الاستخدام بيعرض شاشة مش إعادة توجيه صامتة.
 *
 * الجلسة هنا جاهزة من `global-setup.ts` (نفس افتراضي الملف) — مفيش
 * داعي لفلو دخول يدوي هنا.
 */

for (const [base, name, homeHeading] of [
  [ADMIN, 'الأدمن', 'نظرة عامة'],
  [DEALERS, 'المعارض', null],
] as const) {
  test(`${name}: F5 بيحافظ على الجلسة (التوكن في الذاكرة بس)`, async ({ page }) => {
    const errors = watchConsole(page);
    await open(page, base + '/');
    await page.reload({ waitUntil: 'networkidle' });
    // لو الجلسة ضاعت، middleware.ts كان هيرجّعنا لـ/login
    await expect(page).toHaveURL(base + '/');
    if (homeHeading) await expect(page.locator('h1').first()).toContainText(homeHeading);
    expectCleanConsole(errors);
  });

  test(`${name}: زرار الخروج بيقفل الجلسة ويمنع الوصول المباشر تاني`, async ({ page }) => {
    await open(page, base + '/');

    const logout = page.getByRole('button', { name: 'تسجيل الخروج' });
    await expect(logout).toBeVisible();
    await logout.click();

    await page.waitForURL(base + '/login');

    // بعد الخروج، الوصول المباشر لمسار محمي لازم يرجّع لـ/login تاني
    await page.goto(base + '/');
    await page.waitForURL(/\/login/);
  });

  test(`${name}: بانر الوضع التجريبي ظاهر (مفيش باك اند متوصّل)`, async ({ page }) => {
    await open(page, base + '/');
    await expect(page.getByText('وضع تجريبي').first()).toBeVisible();
  });

  test(`${name}: انتهاء الجلسة أثناء الاستخدام بيعرض شاشة واضحة`, async ({ page }) => {
    await open(page, base + '/');
    await expect(page.locator('h1').first()).toBeVisible();

    // بنحاكي 401 نهائي (فشل التجديد) — نفس الحدث اللي client.ts بيبعته
    await page.evaluate(() => window.dispatchEvent(new Event('carq:session-expired')));

    await expect(page.getByText('انتهت الجلسة')).toBeVisible();
    const relogin = page.getByRole('button', { name: 'سجّل دخول تاني' });
    await expect(relogin).toBeVisible();
    await relogin.click();
    await page.waitForURL(base + '/login');
  });
}
