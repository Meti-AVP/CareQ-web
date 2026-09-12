import { expect, test } from '@playwright/test';
import { ADMIN, DEALERS, open, watchConsole } from './helpers';

/**
 * الفحص الأمني — من غير Authentication (بالاتفاق، هيتضاف بعدين)
 *
 * بيتأكد إن كل خطوط الدفاع التانية شغالة فعليًا في المتصفح:
 * ترويسات الأمان، منع XSS، إخفاء التليفونات، نضافة التخزين.
 */

for (const [base, name] of [
  [ADMIN, 'لوحة الأدمن'],
  [DEALERS, 'بوابة المعارض'],
] as const) {
  test(`${name}: ترويسات الأمان كاملة على كل استجابة`, async ({ page }) => {
    const response = await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    const headers = response!.headers();

    // CSP موجودة وبتقفل الأبواب الأساسية
    const csp = headers['content-security-policy'];
    expect(csp, 'CSP مفقودة').toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');

    // مفيش تسريب هوية السيرفر
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test(`${name}: مفيش أي تخزين في المتصفح ولا كوكيز (§10)`, async ({ page }) => {
    await open(page, base + '/');
    // نتمشى في اللوحة شوية عشان أي كود عنده نية يخزّن ياخد فرصته
    await page.waitForTimeout(1500);

    const storage = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookies: document.cookie,
    }));
    expect(storage.local, 'localStorage المفروض فاضية').toBe(0);
    expect(storage.session, 'sessionStorage المفروض فاضية').toBe(0);
    expect(storage.cookies, 'مفيش كوكيز من غير auth').toBe('');
  });
}

test('محاولة XSS في البحث بتتعرض كنص مش بتتنفذ', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/listings');

  const payload = '"><img src=x onerror="window.__xss=1">';
  const search = page.getByPlaceholder(/دوّر|ابحث/).first();
  await search.fill(payload);
  await page.waitForTimeout(800);

  const executed = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  expect(executed, 'الحقن اتنفّذ — ثغرة XSS').toBeUndefined();

  // React بيعرض النص زي ما هو — الصفحة عايشة وما فيش error boundary اتفتحت
  await expect(page.locator('h1').first()).toBeVisible();
  expectNoInjectionNoise(errors);
});

test('محاولة XSS في فورم إضافة عربية (خانة الملاحظات/الموديل)', async ({ page }) => {
  watchConsole(page);
  await open(page, DEALERS + '/inventory/new');

  const payload = '<script>window.__xss=2</script>';
  const textInputs = page.locator('input[type="text"], textarea');
  const n = Math.min(await textInputs.count(), 4);
  for (let i = 0; i < n; i++) {
    const input = textInputs.nth(i);
    if (await input.isEditable()) await input.fill(payload);
  }
  await page.waitForTimeout(500);

  const executed = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  expect(executed).toBeUndefined();
});

test('التليفونات مخفية في كل الجداول اللي بتعرض ناس', async ({ page }) => {
  for (const path of ['/users', '/sell-now', '/financing', '/exhibitions/requests']) {
    await open(page, ADMIN + path);
    const table = page.locator('table tbody').first();
    if (!(await table.count())) continue;
    const text = (await table.innerText()).replace(/[\s\u00A0]/g, '');
    expect(text, `رقم كامل مكشوف في ${path}`).not.toMatch(/01[0125]\d{8}/);
  }
});

test('روابط خارجية (لو فيه) لازم يكون معاها noopener', async ({ page }) => {
  await open(page, ADMIN + '/');
  const offenders = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[target="_blank"]'))
      .filter((a) => !(a.getAttribute('rel') ?? '').includes('noopener'))
      .map((a) => a.getAttribute('href')),
  );
  expect(offenders).toEqual([]);
});

/** أخطاء الكونسول الناتجة عن الحقن نفسه (img 404) مقبولة — التنفيذ هو الممنوع */
function expectNoInjectionNoise(errors: string[]): void {
  const real = errors.filter((e) => !/Failed to load resource/.test(e));
  expect(real).toEqual([]);
}
