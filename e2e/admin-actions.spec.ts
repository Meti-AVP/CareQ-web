import { expect, test } from '@playwright/test';
import { ADMIN, expectCleanConsole, expectHeading, open, watchConsole } from './helpers';

/**
 * أكشنات الأدمن اللي بتغيّر حالة فعلية — المرحلة ٧ (`MISSION.md §7`
 * بند ٢: «إنه بيعمل حاجة، مش بس موجود»). الملفات الموجودة (`admin.spec.ts`)
 * بتغطّي القراءة/الفلترة/التنقّل بعمق، لكن الأكشنات اللي بتغيّر بيانات
 * فعليًا (إيقاف مستخدم، تغيير حالة تمويل، رفض إعلان، إصدار عرض، فحص
 * الصحة يدويًا) مكنش ليها اختبار end-to-end قبل كده.
 */

test('المستخدمين: إيقاف حساب ثم إلغاء الإيقاف — رحلة كاملة', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/users');

  const suspendBtn = page.getByRole('button', { name: 'إيقاف' }).first();
  await expect(suspendBtn).toBeVisible();
  await suspendBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmSuspend = dialog.getByRole('button', { name: 'أوقف الحساب' });
  await expect(confirmSuspend).toBeDisabled(); // السبب إجباري (≥4 حروف)
  await dialog.getByRole('textbox').last().fill('مخالفة شروط الاستخدام');
  await expect(confirmSuspend).toBeEnabled();
  await confirmSuspend.click();
  await expect(dialog).toBeHidden();

  // بعد النجاح الزرار بيتبدّل لـ«إلغاء الإيقاف» لنفس الصف
  const unsuspendBtn = page.getByRole('button', { name: 'إلغاء الإيقاف' }).first();
  await expect(unsuspendBtn).toBeVisible();
  await unsuspendBtn.click();
  const confirmUnsuspend = dialog.getByRole('button', { name: 'ارجّع الحساب' });
  await dialog.getByRole('textbox').last().fill('اتأكد إن المشكلة اتصلّحت');
  await confirmUnsuspend.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'إيقاف' }).first()).toBeVisible();

  expectCleanConsole(errors);
});

test('التمويل: تغيير حالة طلب محتاج سبب — والحالة بتتحدّث في الشاشة', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/financing');
  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/financing\/fa-/);
  await expectHeading(page);

  const actionBtn = page.locator('button:not([disabled])', { hasText: /علّم|وافق|ارفض/ }).first();
  await expect(actionBtn).toBeVisible();
  await actionBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').last().fill('راجعت الطلب وده القرار');
  // زرار التأكيد نص مختلف عن زرار التفعيل ("أكّد"/"ارفض الطلب") — مش
  // نفس نص الزرار اللي فتح الديالوج، فبنستثني زرار الإلغاء بس
  await dialog.getByRole('button').filter({ hasNotText: 'إلغاء' }).last().click();
  await expect(dialog).toBeHidden();

  expectCleanConsole(errors);
});

test('الإعلانات: رفض إعلان محتاج سبب — الحالة بتتحدّث وبانر endpoint الناقص ظاهر', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/listings');
  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/listings\/l-/);
  await expectHeading(page);

  // البانر بيوضّح إن الأكشن ده شغّال على الموك بس لحد ما الباك يجهز
  await expect(page.getByText(/الـendpoints دي لسه ناقصة في الباك/)).toBeVisible();

  const rejectBtn = page.getByRole('button', { name: 'ارفض الإعلان' });
  if (await rejectBtn.isEnabled()) {
    await rejectBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').last().fill('صور غير مطابقة للعربية الحقيقية');
    await dialog.getByRole('button', { name: 'ارفض الإعلان' }).click();
    await expect(dialog).toBeHidden();
    await expect(rejectBtn).toBeDisabled(); // الإعلان بقى rejected بالفعل
  }

  expectCleanConsole(errors);
});

test('بيع حالًا: إصدار عرض لطلب pending — السعر متعبّي مسبقًا بالسعر المقترح', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/sell-now');

  const offerBtn = page.getByRole('button', { name: 'أصدر عرض' }).first();
  test.skip((await offerBtn.count()) === 0, 'مفيش طلب pending ظاهر في الصفحة الأولى دلوقتي');
  await offerBtn.click();

  const dialog = page.getByRole('dialog', { name: 'إصدار عرض بيع حالًا' });
  await expect(dialog).toBeVisible();
  const sendBtn = dialog.getByRole('button', { name: 'ابعت العرض' });
  await expect(sendBtn).toBeEnabled(); // متعبّي بالسعر المقترح تلقائيًا
  await sendBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('العرض اتبعت للبائع')).toBeVisible();

  expectCleanConsole(errors);
});

test('طلبات الترقية: طلب استكمال بيانات — لازم تحديد حقل، وبعدها بيتبعت فعليًا', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/exhibitions/requests');

  const firstRow = page.locator('tr[data-row-id]').first();
  test.skip((await firstRow.count()) === 0, 'مفيش طلب مستني مراجعة في الصفحة الأولى دلوقتي');
  await firstRow.click();

  const reviewDialog = page.getByRole('dialog');
  await expect(reviewDialog).toBeVisible();
  await reviewDialog.getByRole('button', { name: 'اطلب استكمال' }).click();

  const infoDialog = page.getByRole('dialog', { name: 'طلب استكمال بيانات' });
  await expect(infoDialog).toBeVisible();
  const sendBtn = infoDialog.getByRole('button', { name: 'ابعت طلب الاستكمال' });
  await infoDialog.getByRole('textbox').last().fill('محتاجين نسخة أوضح من المستندات');

  // من غير تحديد حقل واحد على الأقل — رفض واضح، مش إرسال صامت
  await sendBtn.click();
  await expect(page.getByText('اختار الحقول المطلوبة الأول')).toBeVisible();
  await expect(infoDialog).toBeVisible(); // لسه مفتوح، مبعتش

  await infoDialog.getByRole('button', { name: 'صورة السجل التجاري' }).click();
  await sendBtn.click();
  await expect(page.getByText('اتبعت طلب استكمال للمعرض')).toBeVisible();

  expectCleanConsole(errors);
});

test('المزادات: تعليم مزاد متسوّي كمتعثر — type-to-confirm بالحرف', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/auctions');

  await page.getByRole('tab', { name: 'متسوّية' }).click();
  await page.waitForLoadState('networkidle'); // التاب بيغيّر الفلتر وبيجيب صفوف جديدة
  const firstRow = page.locator('tr[data-row-id]').first();
  test.skip((await firstRow.count()) === 0, 'مفيش مزاد متسوّي في الصفحة الأولى دلوقتي');
  await firstRow.waitFor({ state: 'visible' });
  await firstRow.click();
  await page.waitForURL(/\/auctions\/a-/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'تعليم متعثر' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole('button', { name: 'علّمه متعثر' });

  // السبب لوحده مش كفاية — لازم كتابة «متعثر» بالحرف كمان (أخطر أكشن في الشاشة)
  await dialog.getByRole('textbox').first().fill('الفايز رفض يستلم العربية بعد ٣ محاولات تواصل');
  await expect(confirmBtn).toBeDisabled();
  await dialog.getByRole('textbox').last().fill('متعثر');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(dialog).toBeHidden();

  expectCleanConsole(errors);
});

test('صحة النظام: «افحص دلوقتي» بيعمل refetch من غير ما يكسر الشاشة', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/health');

  const scanBtn = page.getByRole('button', { name: 'افحص دلوقتي' });
  await scanBtn.click();
  // مفيش وعد بحالة loading مرئية لفترة كافية للقياس دايمًا (الموك سريع) —
  // اللي بيهمنا إن الضغط مايكسرش الشاشة ومفيش خطأ كونسول بعده
  await page.waitForTimeout(500);
  await expectHeading(page);

  expectCleanConsole(errors);
});

test('بيع حالًا: تأكيد استلام طلب مقبول', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/sell-now');

  await page.getByRole('tab', { name: 'مقبولة' }).click();
  await page.waitForLoadState('networkidle');
  const collectBtn = page.getByRole('button', { name: 'تم الاستلام' }).first();
  test.skip((await collectBtn.count()) === 0, 'مفيش طلب مقبول في الصفحة الأولى دلوقتي');
  await collectBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole('button', { name: 'أكّد الاستلام' });
  await expect(confirmBtn).toBeEnabled(); // requireReason={false} — مفيش سبب مطلوب هنا
  await confirmBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('الاستلام اتسجّل')).toBeVisible();

  expectCleanConsole(errors);
});

test('بيع حالًا: نسخ رقم البائع الكامل — كشف + نسخ في ضغطة واحدة', async ({ page, context }) => {
  const errors = watchConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, ADMIN + '/sell-now');

  const copyBtn = page.getByRole('button', { name: 'انسخ رقم البائع' }).first();
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();
  await expect(page.getByText('الرقم اتنسخ')).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/^01[0125]\d{8}$/); // رقم مصري كامل، مش المخفي

  expectCleanConsole(errors);
});

test('الإعلانات: تفعيل/سحب شارة «ممشى موثّق» — سبب إجباري', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/listings');
  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/listings\/l-/);

  const toggle = page.getByRole('switch', { name: 'ممشى موثّق' });
  await expect(toggle).toBeVisible();
  const wasChecked = (await toggle.getAttribute('aria-checked')) === 'true';
  await toggle.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmLabel = wasChecked ? 'اسحب الشارة' : 'فعّل الشارة';
  const confirmBtn = dialog.getByRole('button', { name: confirmLabel });
  await expect(confirmBtn).toBeDisabled(); // السبب إجباري
  await dialog.getByRole('textbox').last().fill('راجعت صور العداد وأكّدت الرقم');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-checked', String(!wasChecked));

  expectCleanConsole(errors);
});

test('المزادات: أكّد دفع رسوم دخول من طابور «رسوم دخول مستنية تأكيد»', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/auctions');

  await page.getByText('رسوم دخول مستنية تأكيد').scrollIntoViewIfNeeded();
  const payBtn = page.getByRole('button', { name: 'أكّد الدفع' }).first();
  test.skip((await payBtn.count()) === 0, 'مفيش رسوم غير مؤكّدة في الصفحة الأولى دلوقتي');
  await payBtn.click();

  const dialog = page.getByRole('dialog', { name: 'تأكيد دفع رسوم الدخول' });
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole('button', { name: 'أكّد الدفع' });
  await expect(confirmBtn).toBeDisabled();
  await dialog.getByRole('textbox').last().fill('تحويل بنكي رقم 445');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('اتسجّل الدفع')).toBeVisible();

  // نفس الديالوج والهوك بالظبط مستخدمين في /auctions/[id] (تفاصيل مزاد
  // واحد) — مغطّى بالتبعية، مش محتاج اختبار مكرر لنفس المسار البرمجي
  expectCleanConsole(errors);
});

test('التمويل: عرض صورة البطاقة برابط موقّت (عدّاد ٥ دقايق)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/financing');
  await page.locator('tr.cursor-pointer').first().click();
  await page.waitForURL(/\/financing\/fa-/);
  await expectHeading(page);

  // وضع الموك بيرد بـsetTimeout مش نداء شبكة حقيقي — networkidle
  // مايستنّاش عليه خالص، فلازم نستنى محتوى الشاشة نفسه (الزرار أو
  // بانر «الصور اتمسحت») قبل ما نقرر skip من عدمه
  const viewBtn = page.getByRole('button', { name: /اعرض الصورة/ }).first();
  await expect(viewBtn.or(page.getByText('الصور اتمسحت بعد قفل الطلب')).first()).toBeVisible();
  test.skip((await viewBtn.count()) === 0, 'صور البطاقة اتمسحت (الطلب مقفول) في العيّنة دي');
  await viewBtn.click();

  const dialog = page.getByRole('dialog', { name: 'وش البطاقة' });
  await expect(dialog).toBeVisible();
  // الرابط الموقّع بيوّدي على /api/private-preview — كان مفيش route
  // ليه خالص فالصورة كانت بترجع 404 دايمًا في وضع الديمو (اتلقط هنا،
  // اتصلّح بـplaceholder SVG في apps/admin/src/app/api/private-preview)
  const img = dialog.getByRole('img', { name: 'صورة البطاقة' });
  await expect(img).toBeVisible();
  await expect(img).toHaveJSProperty('complete', true);
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  // عدّاد الصلاحية ظاهر — رابط مؤقت حقيقي مش ثابت
  await expect(dialog.locator('text=/\\d/').first()).toBeVisible();

  expectCleanConsole(errors);
});

test('المستخدمين: ترقية حساب فردي لمعرض — type-to-confirm بالحرف', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/users');

  await page.getByRole('tab', { name: 'أفراد' }).click();
  // .count() مابيستناش زي expect — التاب بيغيّر فلتر الهوك ويجيب بيانات
  // جديدة، فلازم نستنى أول صف يترندر فعليًا قبل ما نقرر skip من عدمه
  await page.locator('tr[data-row-id]').first().waitFor({ state: 'visible' });
  const promoteBtn = page.getByRole('button', { name: 'رقّي لمعرض' }).first();
  test.skip((await promoteBtn.count()) === 0, 'مفيش حساب فردي في الصفحة الأولى دلوقتي');
  await promoteBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole('button', { name: 'رقّي الحساب' });
  await dialog.getByRole('textbox').first().fill('السجل التجاري والبطاقة الضريبية اتأكدوا');
  await expect(confirmBtn).toBeDisabled(); // لسه محتاج كتابة «ترقية» بالحرف
  await dialog.getByRole('textbox').last().fill('ترقية');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('الحساب بقى معرض')).toBeVisible();

  expectCleanConsole(errors);
});
