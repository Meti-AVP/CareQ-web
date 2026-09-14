import { expect, test } from '@playwright/test';
import { DEALERS, expectCleanConsole, open, watchConsole } from './helpers';

/**
 * أكشنات بوابة المعارض اللي بتغيّر حالة فعلية — المرحلة ٧ (`MISSION.md
 * §7` بند ٢). نفس فلسفة `admin-actions.spec.ts`: `dealers.spec.ts`
 * الموجود بيغطّي القراءة/الفلترة بعمق، والملف ده بيغطّي الأكشنات اللي
 * بتغيّر بيانات فعليًا ومكنش ليها اختبار end-to-end قبل كده.
 */

test('المخزون: تجديد إعلان لـ٣٠ يوم — توست نجاح فعلي', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory');

  const renewBtn = page.getByRole('button', { name: 'تجديد ٣٠ يوم' }).first();
  await expect(renewBtn).toBeVisible();
  await renewBtn.click();
  await expect(page.getByText('الإعلان اتجدّد')).toBeVisible();

  expectCleanConsole(errors);
});

test('المخزون: حذف إعلان محتاج تأكيد — soft delete مش اختفاء صامت', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory');

  // تاب «الكل» (الافتراضي) بيعرض كل الحالات عمدًا (`match: () => true`)
  // بما فيها متشالة/مرفوضة — فيه تاب مخصّص ليهم («متشالة ومرفوضة»).
  // يعني soft delete هنا معناه **تغيّر الحالة**، مش اختفاء الصف من
  // القايمة الافتراضية — بنتأكد من البادج نفسه بدل عدد/وجود الصف.
  const targetRow = page.locator('tr[data-row-id]').first();
  const targetId = await targetRow.getAttribute('data-row-id');
  await targetRow.getByRole('button', { name: 'حذف' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'احذف' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('الإعلان اتحذف')).toBeVisible();

  // soft delete فعلي (X-6) — الصف لسه موجود بس بحالة «متشالة»
  await expect(page.locator(`tr[data-row-id="${targetId}"]`)).toContainText('متشالة');

  // وبيظهر في تاب «متشالة ومرفوضة» المخصّص ليه
  await page.getByRole('tab', { name: /متشالة ومرفوضة/ }).click();
  await expect(page.locator(`tr[data-row-id="${targetId}"]`)).toBeVisible();

  expectCleanConsole(errors);
});

test('الاستفسارات: فتح محادثة وإرسال رد فعلي', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/leads');

  await page.locator('tr[data-row-id]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const input = dialog.getByLabel('نص الرد');
  const sendBtn = dialog.getByRole('button', { name: 'ابعت' });
  await expect(sendBtn).toBeDisabled();
  await input.fill('العربية لسه متاحة، تحب تحدد ميعاد معاينة؟');
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();
  await expect(input).toHaveValue('');

  expectCleanConsole(errors);
});

test('ملف المعرض: التعديل بيفعّل زرار الحفظ، والحفظ بيرجّع توست نجاح', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/profile');

  const nameField = page.getByLabel('اسم المعرض');
  const saveBtn = page.getByRole('button', { name: 'احفظ التعديلات' }).first();
  await expect(saveBtn).toBeDisabled(); // مفيش تعديل لسه (dirty=false)

  await nameField.fill('');
  await nameField.fill('أوتو جروب الجديد');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(page.getByText('الملف اتحدّث')).toBeVisible();

  expectCleanConsole(errors);
});

test('الرسوم والفواتير: رفع إيصال دفع رسوم الدخول فعليًا (PayEntryButton)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/billing');

  const payBtn = page.getByRole('button', { name: 'حوّل الرسوم وابعت الإيصال' }).first();
  test.skip((await payBtn.count()) === 0, 'مفيش دخول مستني تحويل في العيّنة الحالية');
  await payBtn.click();

  const dialog = page.getByRole('dialog', { name: 'حوّل رسوم الدخول' });
  await expect(dialog).toBeVisible();
  const sendBtn = dialog.getByRole('button', { name: 'ابعت الإيصال' });
  await expect(sendBtn).toBeDisabled(); // مفيش ملف مرفق لسه

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    // بايتات PNG حقيقية (هيدر الصيغة) — مش نص وهمي، عشان قرب أي وقت
    // فحص نوع MIME حقيقي يتضاف على الرفع الفعلي (لسه موك بالكامل دلوقتي)
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(dialog.getByText('تم الإرفاق')).toBeVisible();
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();
  await expect(page.getByText('الإيصال وصلنا')).toBeVisible();

  expectCleanConsole(errors);
});

test('المخزون: تعليم عربية متباعة (ديالوج) — توست نجاح فعلي', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory');

  const soldBtn = page.getByRole('button', { name: 'تعليم متباع' }).first();
  test.skip((await soldBtn.count()) === 0, 'مفيش إعلان نشط غير متباع في الصفحة الأولى دلوقتي');
  await soldBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'علّمها متباعة' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('اتعلّمت متباعة')).toBeVisible();

  expectCleanConsole(errors);
});

test('طلب الانضمام: رحلة كاملة من البيانات للإرسال (٣ خطوات)', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/apply');

  // ───── خطوة ١: بيانات المعرض ─────
  await page.getByLabel('اسم المعرض').fill('أوتو ستار للسيارات');
  await page.getByLabel('اسم المالك').fill('كريم عادل حسين');
  await page.getByLabel('تليفون المعرض').fill('01012345678');

  const govSelect = page.getByLabel('المحافظة');
  await govSelect.selectOption({ index: 1 });
  // المنطقة بتتحول لـselect بعد ما المحافظة تتحدد ولحقاتها تتحمّل
  const areaField = page.getByLabel('المنطقة');
  await expect(areaField).toBeEnabled();
  const areaIsSelect = (await areaField.evaluate((el) => el.tagName)) === 'SELECT';
  if (areaIsSelect) await areaField.selectOption({ index: 1 });
  else await areaField.fill('حي أول');

  await page.getByLabel('العنوان بالتفصيل').fill('٢٢ شارع النصر — أمام محطة المترو');
  await page.getByLabel('رقم السجل التجاري').fill('123456');
  await page.getByLabel('الرقم الضريبي').fill('654321');

  await page.getByRole('button', { name: 'التالي' }).click();

  // ───── خطوة ٢: الأوراق ─────
  const pdfBytes = Buffer.from('%PDF-1.4 fake');
  const png = { mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
  await page.getByLabel('صورة السجل التجاري').setInputFiles({ name: 'cr.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await page.getByLabel('صورة البطاقة الضريبية').setInputFiles({ name: 'tax.png', ...png });
  await page.getByLabel('بطاقة المالك — الوش').setInputFiles({ name: 'id-front.png', ...png });
  await page.getByLabel('بطاقة المالك — الضهر').setInputFiles({ name: 'id-back.png', ...png });
  // أقل عدد مطلوب لصور المعرض = ٣ — العنوان بيتولّد بـ`صورة ${i+1}` برقم
  // إنجليزي عادي (JS template literal)، مش رقم عربي هندي
  await page.getByLabel('صورة 1').setInputFiles({ name: 'venue1.png', ...png });
  await page.getByLabel('صورة 2').setInputFiles({ name: 'venue2.png', ...png });
  await page.getByLabel('صورة 3').setInputFiles({ name: 'venue3.png', ...png });

  await page.getByRole('button', { name: 'التالي' }).click();

  // ───── خطوة ٣: المراجعة والإرسال ─────
  const submitBtn = page.getByRole('button', { name: 'ابعت الطلب' });
  await expect(submitBtn).toBeVisible();
  await submitBtn.click();

  await expect(page.getByRole('heading', { name: 'طلبك وصلنا' })).toBeVisible({ timeout: 5_000 });

  expectCleanConsole(errors);
});
