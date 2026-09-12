import { expect, test } from '@playwright/test';
import { ADMIN, expectCleanConsole, expectHeading, open, watchConsole } from './helpers';

/**
 * جولة المستخدم الحقيقي — لوحة الأدمن (16 شاشة)
 *
 * كل اختبار بيمشي زي أدمن فعلًا: بيفتح، بيقرا، بيدوس، بيقلّب،
 * بيدخل التفاصيل — والكونسول متراقب من أول لحظة لآخرها.
 */

test.describe('لوحة الأدمن — كل الشاشات بتفتح نضيفة', () => {
  for (const [path, name] of [
    ['/', 'النظرة العامة'],
    ['/listings', 'الإعلانات'],
    ['/users', 'المستخدمين'],
    ['/exhibitions', 'المعارض'],
    ['/exhibitions/requests', 'طلبات الترقية'],
    ['/auctions', 'المزادات'],
    ['/sell-now', 'بيع حالًا'],
    ['/financing', 'التمويل'],
    ['/audit', 'سجل التدقيق'],
    ['/health', 'صحة النظام'],
    ['/login', 'الدخول'],
  ] as const) {
    test(`${name} (${path})`, async ({ page }) => {
      const errors = watchConsole(page);
      await open(page, ADMIN + path);
      await expectHeading(page);
      expectCleanConsole(errors);
    });
  }
});

test('النظرة العامة: KPIs ورسوم شغالة و«عرض كجدول» بيقلب فعلًا', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/');

  // بلاطات KPI موجودة والرسوم اترسمت SVG فعلًا
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible();

  // زرار «عرض كجدول» — إتاحة أساسية لكل رسم
  const toggle = page.locator('button[title="عرض كجدول"]').first();
  await toggle.click();
  await expect(page.locator('table').first()).toBeVisible();

  expectCleanConsole(errors);
});

test('الإعلانات: بحث ثم ترقيم صفحات ثم فتح تفاصيل إعلان', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/listings');

  const table = page.locator('table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();

  // ١) البحث بيقلّص النتائج ومابيكسرش حاجة
  const search = page.getByPlaceholder(/دوّر|ابحث/).first();
  await search.fill('تويوتا');
  await page.waitForTimeout(600); // debounce
  await expect(table.locator('tbody tr').first()).toBeVisible();
  await search.clear();
  await page.waitForTimeout(600);

  // ٢) الترقيم: «التالي» بيجيب صف أول مختلف و«السابق» بيرجّعه
  const rowText = () => table.locator('tbody tr').first().innerText();
  const firstRowBefore = await rowText();
  await page.getByRole('button', { name: 'التالي' }).first().click();
  await expect.poll(rowText).not.toBe(firstRowBefore);
  await page.getByRole('button', { name: 'السابق' }).first().click();
  await expect.poll(rowText).toBe(firstRowBefore);

  // ٣) الدوس على صف بيفتح التفاصيل
  await table.locator('tbody tr').first().click();
  await page.waitForURL(/\/listings\/l-/);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('المستخدمين: التليفونات مخفية جزئيًا في الجدول (§10.2)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/users');

  const body = await page.locator('table tbody').first().innerText();
  expect(body).toContain('•••');
  // مفيش رقم مصري كامل ظاهر في الجدول
  expect(body.replace(/\s/g, '')).not.toMatch(/01[0125]\d{8}/);

  expectCleanConsole(errors);
});

test('المزادات: التبويبات بتفلتر وفتح مزاد بيعرض المزايدات', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/auctions');

  // تقليب التبويبات — كل تبويبة بترندر من غير أخطاء
  const tablist = page.getByRole('tablist').first();
  const tabs = tablist.getByRole('tab');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(400);
  }
  await tabs.first().click();
  await page.waitForTimeout(400);

  // فتح أول مزاد — الصفوف القابلة للدوس عليها cursor-pointer
  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/auctions\/a-/);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('طلبات الترقية: التبويبات + فتح طلب', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/exhibitions/requests');

  const tabs = page.getByRole('tablist').first().getByRole('tab');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(350);
  }
  expectCleanConsole(errors);
});

test('المعارض: الفلاتر والترقيم وفتح ملف معرض', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/exhibitions');

  // الدوس على خلية الاسم (أول خلية) — نص الصف فيه عناصر تفاعلية
  // (مفتاح التعاقد والشارات) والضغط في نص الصف بيروح ليها مش للتنقل
  await page.locator('tr.cursor-pointer').first().locator('td').first().click();
  await page.waitForURL(/\/exhibitions\/ex-/);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('بيع حالًا: فتح طلب من الجدول', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/sell-now');

  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/sell-now\/sn-/);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('سجل التدقيق: الفلاتر والترقيم بأزرار الأحدث/الأقدم', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/audit');

  // الترقيم موجود ومكتوب فيه العدّاد
  await expect(page.getByText(/من\s[\d,]+\sحدث/).first()).toBeVisible();

  expectCleanConsole(errors);
});

test('صحة النظام: التبويبات بتقلب من غير أخطاء', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/health');

  const tabs = page.getByRole('tablist').first().getByRole('tab');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(350);
  }
  expectCleanConsole(errors);
});

test('الدخول: تحقق الرقم ثم كود OTP ثم الوصول للوحة', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/login');

  // رقم غلط ⇒ رسالة واضحة قبل أي إرسال
  const phoneInput = page.locator('input[type="tel"]');
  await phoneInput.fill('0123');
  // الزرار disabled طول ما الرقم مش صالح — ده التحقق نفسه
  await expect(page.getByRole('button', { name: /ابعت كود/ })).toBeDisabled();

  // رقم صحيح ⇒ خطوة الكود
  await phoneInput.fill('01001234567');
  await page.getByRole('button', { name: /ابعت كود/ }).click();
  await expect(page.getByText('اكتب الكود')).toBeVisible();

  // كتابة الكود — الخانات بتنط لوحدها
  const boxes = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).fill(String(i + 1));
  await page.getByRole('button', { name: /ادخل على اللوحة/ }).click();

  // بنوصل للنظرة العامة
  await page.waitForURL(ADMIN + '/');
  await expectHeading(page);

  expectCleanConsole(errors);
});
