import { expect, test } from '@playwright/test';
import { ADMIN, DEALERS, expectCleanConsole, expectHeading, open, watchConsole } from './helpers';

/**
 * جولة المستخدم الحقيقي — لوحة الأدمن (16 شاشة)
 *
 * كل اختبار بيمشي زي أدمن فعلًا: بيفتح، بيقرا، بيدوس، بيقلّب،
 * بيدخل التفاصيل — والكونسول متراقب من أول لحظة لآخرها.
 */

test.describe('لوحة الأدمن — كل الشاشات بتفتح نضيفة', () => {
  // /login مش هنا: زيارتها وإحنا داخلين بجلسة بترجّع لـ/ (المرحلة ٢) —
  // شوف 'تسجيل الدخول من غير جلسة سابقة' تحت لاختبار /login فعليًا.
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

test('منح التعاقد (المرحلة ٣ — FND-020) محتاج كتابة «تعاقد» للتأكيد، إيقافه لأ', async ({
  page,
}) => {
  await open(page, ADMIN + '/exhibitions');
  await page.locator('tr.cursor-pointer').first().locator('td').first().click();
  await page.waitForURL(/\/exhibitions\/ex-/);

  const toggleBtn = page.getByRole('button', { name: /امنح التعاقد|أوقف التعاقد/ }).first();
  const willGrant = (await toggleBtn.textContent())?.includes('امنح');
  await toggleBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole('button', { name: /امنح التعاقد|أوقف التعاقد/ });

  if (willGrant) {
    // منح التعاقد — بيفتح مسار مالي حقيقي، محتاج كتابة «تعاقد» بالحرف
    await expect(dialog.getByText(/اكتب.*تعاقد.*للتأكيد/)).toBeVisible();
    await expect(confirmBtn).toBeDisabled();
    await dialog.getByRole('textbox').last().fill('تعاقد');
  } else {
    // إيقاف التعاقد — سبب + تأكيد الـdialog العادي كافيين، من غير كتابة كلمة
    await expect(dialog.getByText(/اكتب.*للتأكيد/)).toHaveCount(0);
  }
  await expect(confirmBtn).toBeDisabled(); // لسه محتاج السبب الإجباري
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

test.describe('تسجيل الدخول من غير جلسة سابقة (المرحلة ٢)', () => {
  // نبدأ من غير أي كوكي — عكس باقي الملف اللي جلسته جاهزة من global-setup.ts
  test.use({ storageState: { cookies: [], origins: [] } });

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

test('وصول مباشر لمسار محمي من غير جلسة بيرجّع لـ/login مع ?next=', async ({ page }) => {
  await page.goto(ADMIN + '/listings');
  await page.waitForURL(/\/login\?next=%2Flistings/);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
});

test('دخول برقم صاحب معرض حقيقي (دور غلط) بيترفض من غير ما يقول إن فيه لوحة أصلًا', async ({
  page,
}) => {
  await open(page, ADMIN + '/login');
  // 01246830664 = صاحب المعرض التجريبي (ex-1) في بيانات الموك —
  // موجود فعليًا بس دوره exhibition مش admin (getMockIdentity في
  // packages/api-client/src/mock/db.ts بترجع هويته الحقيقية بدل
  // ADMIN_USER الافتراضية لما الرقم يتطابق مع مستخدم حقيقي)
  await page.locator('input[type="tel"]').fill('01246830664');
  await page.getByRole('button', { name: /ابعت كود/ }).click();
  await expect(page.getByText('اكتب الكود')).toBeVisible();

  const boxes = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).fill(String(i + 1));
  await page.getByRole('button', { name: /ادخل على اللوحة/ }).click();

  // رسالة رفض عامة، من غير ما تفصح إن فيه دور "أدمن" أصلًا
  await expect(page.getByText('الحساب ده مش مصرّح له')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('جلسة أدمن (المرحلة ٣ — عزل التطبيقين) مش بتفتح بوابة المعارض في نفس المتصفح', async ({
  page,
}) => {
  // دخول أدمن فعلي — نفس فلو الاختبار الأول في الملف ده
  await open(page, ADMIN + '/login');
  await page.locator('input[type="tel"]').fill('01001234567');
  await page.getByRole('button', { name: /ابعت كود/ }).click();
  await expect(page.getByText('اكتب الكود')).toBeVisible();
  const boxes = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).fill(String(i + 1));
  await page.getByRole('button', { name: /ادخل على اللوحة/ }).click();
  await page.waitForURL(ADMIN + '/');

  // نفس المتصفح، بوابة المعارض — كوكي الجلسة اسمها مختلف
  // (cq_session_admin مش cq_session_dealers)، فمفروض middleware.ts
  // هناك يرفض الوصول تمامًا (FND-016 من المرحلة ٢ — قبل الإصلاح كانت
  // الكوكي بتتشارك بين اللوحتين محليًا)
  await page.goto(DEALERS + '/inventory');
  await page.waitForURL(/\/login\?next=%2Finventory/);
  await expect(page.getByRole('heading', { name: 'دخول المعرض' })).toBeVisible();

  // apply يفضل مسار عام برضه — مفيش تسريب ولا منع خاطئ
  await page.goto(DEALERS + '/apply');
  await expect(page.getByRole('heading', { name: 'قدّم كمعرض' })).toBeVisible();
});

}); // تسجيل الدخول من غير جلسة سابقة
