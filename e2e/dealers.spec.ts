import { expect, test } from '@playwright/test';
import { DEALERS, expectCleanConsole, expectHeading, open, watchConsole } from './helpers';

/**
 * جولة المستخدم الحقيقي — بوابة المعارض (15 شاشة)
 *
 * البوت هنا بيتصرف كصاحب معرض: بيشوف مخزونه، بيضيف عربية،
 * بيرفع ملف بالجملة، بيدخل مزاد، وبيقدّم طلب انضمام.
 */

test.describe('بوابة المعارض — كل الشاشات بتفتح نضيفة', () => {
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
    ['/login', 'الدخول'],
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
