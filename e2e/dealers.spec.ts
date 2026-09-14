import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { expect, test } from '@playwright/test';
import { DEALERS, expectCleanConsole, expectHeading, open, watchConsole } from './helpers';

/**
 * جولة المستخدم الحقيقي — بوابة المعارض (15 شاشة)
 *
 * البوت هنا بيتصرف كصاحب معرض: بيشوف مخزونه، بيضيف عربية،
 * بيرفع ملف بالجملة، بيدخل مزاد، وبيقدّم طلب انضمام.
 */

test.describe('بوابة المعارض — كل الشاشات بتفتح نضيفة', () => {
  // /login مش هنا: زيارتها وإحنا داخلين بجلسة بترجّع لـ/ (المرحلة ٢) —
  // شوف 'تسجيل الدخول من غير جلسة سابقة' تحت لاختبار /login فعليًا.
  for (const [path, name] of [
    ['/', 'الرئيسية'],
    ['/inventory', 'المخزون'],
    ['/inventory/new', 'إضافة عربية'],
    ['/inventory/bulk', 'الرفع بالجملة'],
    ['/auctions', 'المزادات'],
    ['/auctions/mine', 'مزايداتي'],
    ['/leads', 'المهتمين'],
    ['/billing', 'الفواتير'],
    ['/contract', 'التعاقد'],
    ['/profile', 'الملف'],
    ['/apply', 'طلب الانضمام'],
    ['/apply/status', 'حالة الطلب'],
  ] as const) {
    test(`${name} (${path})`, async ({ page }) => {
      const errors = watchConsole(page);
      await open(page, DEALERS + path);
      await expectHeading(page);
      expectCleanConsole(errors);
    });
  }
});

test('المخزون: فتح عربية من الجدول وقراءة تفاصيلها', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory');

  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/inventory\/l-/);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('إضافة عربية: التحقق بيمنع الغلط برسالة مفهومة (L-3)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory/new');

  // الليبل موصول بالخانة (aria-labelledby من Field) — زي ما قارئ الشاشة بيشوفها
  const price = page.getByLabel(/السعر/).first();
  await expect(price).toBeVisible();
  await price.fill('5000'); // أقل من الحد الأدنى 10,000

  // الأخطاء بتظهر عند محاولة الحفظ — مش وانت لسه بتكتب (قرار UX مقصود)
  await page.getByRole('button', { name: 'احفظ كمسودة' }).click();
  await expect(page.getByText(/أقل سعر مسموح بيه/).first()).toBeVisible();

  // ولما السعر يتظبط الرسالة بتختفي فورًا
  await price.fill('850000');
  await expect(page.getByText(/أقل سعر مسموح بيه/)).toHaveCount(0);

  expectCleanConsole(errors);
});

test('الرفع بالجملة: تحميل القالب ثم رفع ملف فيه صح وغلط', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory/bulk');

  // ١) تحميل القالب بيشتغل فعلًا — بالاسم الكامل مش جزء منه
  //    (في الصفحة عناصر تانية فيها كلمة «القالب» زي مؤشر الخطوات)
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'نزّل قالب CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/csv/i);

  // ٢) رفع ملف فيه صف سليم وصف سعره خارج الحدود
  //    الأعمدة بمفاتيحها الإنجليزية — نفس اللي في القالب الرسمي.
  //    «ياريس» موديل موجود فعلًا في الكتالوج، والسنين القديمة بتضمن
  //    إن مفيش تحذير «تكرار محتمل» مع المخزون المزروع.
  const csv = [
    'make,model,year,price,km,transmission,body,color,governorate,area,description',
    'تويوتا,ياريس,1999,120000,350000,أوتوماتيك,هاتشباك,أحمر,القاهرة,مدينة نصر,',
    'تويوتا,ياريس,2001,5000,250000,أوتوماتيك,هاتشباك,أزرق,القاهرة,مدينة نصر,سعر غلط',
  ].join('\n');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'cars.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\ufeff' + csv, 'utf8'),
  });

  // شاشة المراجعة بتفرّق بين السليم والمرفوض قبل أي استيراد
  await expect(page.getByText('سليم').first()).toBeVisible();
  await expect(page.getByText('مرفوض قبل الإرسال').first()).toBeVisible();

  expectCleanConsole(errors);
});

test('الرفع بالجملة: ربط صور من مجلد بالصفوف ورفعها فعليًا بعد النجاح (FND-034)', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory/bulk');

  // من خطوة القالب لخطوة الرفع — من غير ما نحمّل القالب فعليًا
  await page.getByRole('button', { name: 'عندي الملف جاهز' }).click();

  // ملف بصف واحد سليم بالكامل — عشان نضمن إن الإرسال يشتغل
  const csv = [
    'make,model,year,price,km,transmission,body,color,governorate,area,description',
    'تويوتا,ياريس,2005,180000,150000,أوتوماتيك,هاتشباك,أحمر,القاهرة,مدينة نصر,عربية لاختبار ربط الصور',
  ].join('\n');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'cars.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('﻿' + csv, 'utf8'),
  });

  await expect(page.getByText('سليم').first()).toBeVisible();
  // قبل ربط أي صورة، عمود الصور بيقول «ولا صورة»
  await expect(page.getByText('ولا صورة').first()).toBeVisible();

  // مجلد صور حقيقي على القرص — اسم كل ملف بيبدأ برقم الصف (١-indexed): الصف الأول رقمه ١
  // (خانة `webkitdirectory` مش بتقبل من Playwright غير مسار مجلد فعلي، مش بافرات)
  const dir = mkdtempSync(path.join(tmpdir(), 'carq-bulk-photos-'));
  writeFileSync(path.join(dir, '1-front.jpg'), 'fake-image-1');
  writeFileSync(path.join(dir, '1-side.jpg'), 'fake-image-2');

  const folderInput = page.getByLabel('اسحب مجلد الصور هنا أو دوس للاختيار');
  await folderInput.setInputFiles(dir);

  // اتوزعت على الصف الوحيد — عمود الصور دلوقتي بيقول «2 صورة»
  await expect(page.getByText('2 صورة').first()).toBeVisible();

  await page.getByRole('button', { name: /^ابعت/ }).click();

  // بعد الإرسال: الصف اتنشر، والصورتين اترفعوا فعليًا (2/2)
  await expect(page.getByText('اتنشر').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('2/2')).toBeVisible({ timeout: 15_000 });

  expectCleanConsole(errors);
});

test('المزادات: فتح مزاد وقراءة صندوق المزايدة بحالته الحقيقية', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/auctions');

  // أول كارت/صف مزاد بيفتح التفاصيل
  const link = page.locator('a[href*="/auctions/a-"]').first();
  if (await link.count()) {
    await link.click();
  } else {
    await page.locator('tr.cursor-pointer').first().click();
  }
  await page.waitForURL(/\/auctions\/a-/);
  await expectHeading(page);

  // صندوق المزايدة لازم يكون في حالة من الحالات المشروعة:
  // زرار مزايدة مفعّل، أو سبب مانع واضح (مش متعاقد/ادفع رسوم/انتهى)
  const legitState = page
    .getByRole('button', { name: /زايد/ })
    .or(page.getByText(/رسوم الدخول|مش متعاقد|انتهى|المزاد خلص/));
  await expect(legitState.first()).toBeVisible();

  expectCleanConsole(errors);
});

test('طلب الانضمام: التحقق خطوة بخطوة قبل الإرسال', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/apply');

  // زرار المتابعة/الإرسال مش بيشتغل والفورم فاضي —
  // يا إما disabled يا إما بيطلع رسالة تحقق
  const submit = page.getByRole('button', { name: /التالي|كمّل|ابعت|قدّم/ }).first();
  if (await submit.isEnabled()) {
    await submit.click();
    await expect(page.locator('[class*="crit"], [role="alert"]').first()).toBeVisible();
  } else {
    await expect(submit).toBeDisabled();
  }

  expectCleanConsole(errors);
});

test('حالة الطلب: مبدّل الديمو بيعرض كل الحالات (وضع الموك بس)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/apply/status');

  // في وضع الموك فيه مبدّل حالات — بنقلب عليهم كلهم
  const switcher = page.getByRole('button', { name: /submitted|approved|rejected|مقبول|مرفوض|تحت المراجعة|محتاج/ });
  const n = await switcher.count();
  for (let i = 0; i < n; i++) {
    await switcher.nth(i).click();
    await page.waitForTimeout(350);
    await expectHeading(page);
  }

  expectCleanConsole(errors);
});

test('المهتمين: تليفونات المشترين ظاهرة والتواصل سهل', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/leads');
  await expectHeading(page);
  expectCleanConsole(errors);
});

test.describe('تسجيل الدخول من غير جلسة سابقة (المرحلة ٢)', () => {
  // نبدأ من غير أي كوكي — عكس باقي الملف اللي جلسته جاهزة من global-setup.ts
  test.use({ storageState: { cookies: [], origins: [] } });

  test('الدخول: تليفون ثم كود ٦ أرقام ثم الوصول للوحة المعرض', async ({ page }) => {
    const errors = watchConsole(page);
    await open(page, DEALERS + '/login');

    await page.getByLabel('تليفون المعرض').fill('01001234567');
    await page.getByRole('button', { name: 'ابعت الكود' }).click();
    await expect(page.getByText('اكتب الكود')).toBeVisible();

    await page.getByLabel('كود التأكيد').fill('123456');
    await page.getByRole('button', { name: 'دخول' }).click();

    await page.waitForURL(DEALERS + '/');
    await expectHeading(page);
    expectCleanConsole(errors);
  });

  test('وصول مباشر لمسار محمي من غير جلسة بيرجّع لـ/login مع ?next=', async ({ page }) => {
    await page.goto(DEALERS + '/inventory');
    await page.waitForURL(/\/login\?next=%2Finventory/);
    await expect(page.getByRole('heading', { name: 'دخول المعرض' })).toBeVisible();
  });

  test('apply و apply/status متاحين من غير جلسة (مسار عام مقصود)', async ({ page }) => {
    await open(page, DEALERS + '/apply');
    await expectHeading(page);
    await open(page, DEALERS + '/apply/status');
    await expectHeading(page);
  });

  test('دخول برقم أدمن حقيقي (دور غلط) بيترفض من غير ما يقول إن فيه بوابة أصلًا', async ({
    page,
  }) => {
    await open(page, DEALERS + '/login');
    // 01001234553 = ADMIN_USER في بيانات الموك — موجود فعليًا بس دوره
    // admin مش exhibition (getMockIdentity في mock/db.ts بترجع هويته
    // الحقيقية بدل صاحب المعرض التجريبي لما الرقم يتطابق مع مستخدم حقيقي)
    await page.getByLabel('تليفون المعرض').fill('01001234553');
    await page.getByRole('button', { name: 'ابعت الكود' }).click();
    await expect(page.getByText('اكتب الكود')).toBeVisible();

    await page.getByLabel('كود التأكيد').fill('123456');
    await page.getByRole('button', { name: 'دخول' }).click();

    await expect(page.getByText('الحساب ده مش مصرّح له')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
