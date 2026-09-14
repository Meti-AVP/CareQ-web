import { expect, test } from '@playwright/test';
import { ADMIN, DEALERS, expectCleanConsole, watchConsole } from './helpers';

/**
 * ════════════════════════════════════════════════════════════════
 * حدود الوصول — IDOR وعزل المستأجرين (المرحلة ٧، `MISSION.md §7`)
 *
 * بند صريح: «دي مش موجودة حاليًا وناقصة». هنا أول تغطية آلية له.
 *
 * **قاعدة الملف ده:** الفرض الحقيقي (authorization) لازم يكون
 * سيرفر-سايد (`require_role`/فحص ملكية بالـid). الاختبار الأول هنا
 * لقط باج IDOR حقيقي (`FND-052`, P0) — اتصلّح في وضعي الموك الاتنين
 * (`mock/db.ts::getOwnedListing` و`mock-backend.mjs::findOwnedListing`)،
 * وموثّق كمتطلب إلزامي للباك الحقيقي في `docs/BACKEND-CONTRACT.md §6.0`.
 * الاختبار دلوقتي بيتأكد من السلوك الصحيح (رفض واضح) — لو رجع يفشل من
 * غير تعديل متعمّد على `getOwnedListing`، ده يعني الباج رجع. عزل
 * الأدوار بين التطبيقين (أدمن ↔ معارض) مغطّى بالفعل في `admin.spec.ts`
 * — الملف ده بيغطّي حاجة تانية: **عزل المستأجرين داخل نفس الدور**
 * (معرض شايف/بيعدّل بيانات معرض تاني).
 * ════════════════════════════════════════════════════════════════
 */

test('IDOR — معرض بيفتح /inventory/{id} بتاع إعلان معرض تاني عن طريق تغيير الـURL يدويًا', async ({
  page,
}) => {
  const errors = watchConsole(page);

  // هات id إعلان معروف من لوحة الأدمن — شايفة كل الإعلانات بغض النظر
  // عن المالك (دور شرعي، مش المشكلة). نفس الـstorageState بتاع الجلسة
  // في هذا الاختبار فيه كوكي الأدمن والمعارض مع بعض (global-setup.ts).
  await page.goto(ADMIN + '/listings', { waitUntil: 'networkidle' });
  const adminRowIds = await page.locator('tr[data-row-id]').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-row-id')),
  );
  expect(adminRowIds.length).toBeGreaterThan(0);

  // هات الإعلانات اللي بتاعة المعرض بتاعنا (ex-1) — نفس الصفحة الأولى كفاية
  await page.goto(DEALERS + '/inventory', { waitUntil: 'networkidle' });
  const myRowIds = new Set(
    await page.locator('tr[data-row-id]').evaluateAll((rows) =>
      rows.map((r) => r.getAttribute('data-row-id')),
    ),
  );

  const foreignId = adminRowIds.find((id) => id && !myRowIds.has(id));
  test.skip(!foreignId, 'مقدرناش نلاقي إعلان بتاع معرض تاني في الصفحة الأولى — عيّنة الموك محتاجة مراجعة');
  if (!foreignId) return;

  // الاختبار الفعلي: افتح /inventory/{id} بتاع معرض تاني وإحنا داخلين كـex-1
  await page.goto(`${DEALERS}/inventory/${foreignId}`, { waitUntil: 'networkidle' });

  // ١) مفيش شاشة بيضا ولا كراش — أهم حد أدنى، ده لازم يفضل صح دايمًا
  await expect(page.locator('text=Application error')).toHaveCount(0);
  await expect(page.locator('h1').first()).toBeVisible();

  // ٢) **`FND-052` اتصلّح (`mock/db.ts::getOwnedListing` +
  // `scripts/mock-backend.mjs::findOwnedListing`):** رسالة رفض واضحة
  // («الإعلان ده مش بتاع معرضك»)، مش بيانات الإعلان الحقيقية. لو
  // السطر ده وقع (يعني الرسالة مابانتش)، ده رجوع فعلي لباج IDOR —
  // **متتجاهلش الفشل ده كـ"فلاكي"**.
  await expect(page.getByText('الإعلان ده مش بتاع معرضك')).toBeVisible();
  const titleField = page.locator('input[name="title"], input#title').first();
  await expect(titleField).toHaveCount(0); // فورم التعديل ماترندرش خالص

  expectCleanConsole(errors);
});

test('IDOR — id إعلان مش موجود خالص في /inventory/[id] بيرجّع حالة خطأ واضحة مش كراش', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto(`${DEALERS}/inventory/l-does-not-exist-999999`, { waitUntil: 'networkidle' });

  await expect(page.locator('text=Application error')).toHaveCount(0);
  await expect(page.getByText(/الإعلان مش موجود|مقدرناش نجيب/).first()).toBeVisible();

  expectCleanConsole(errors);
});

for (const [path, label] of [
  ['/sell-now', 'sn-does-not-exist'],
  ['/listings', 'l-does-not-exist'],
  ['/exhibitions', 'ex-does-not-exist'],
  ['/auctions', 'a-does-not-exist'],
  ['/financing', 'fa-does-not-exist'],
] as const) {
  test(`IDOR — id مش موجود في الأدمن ${path}/[id] بيرجّع حالة خطأ واضحة مش كراش`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto(`${ADMIN}${path}/${label}`, { waitUntil: 'networkidle' });

    await expect(page.locator('text=Application error')).toHaveCount(0);
    await expect(page.locator('h1').first()).toBeVisible();
    // كل شاشة تفاصيل في المشروع بتستخدم ErrorState/رسالة عربية عند
    // فشل القراءة (نمط موحّد) — مش صفحة بيضا ومش كراش React
    await expect(
      page.getByText(/مش موجود|مقدرناش نجيب|حاول تاني/).first(),
    ).toBeVisible();

    expectCleanConsole(errors);
  });
}

test('الأرقام التسلسلية للـids — ملاحظة توثيقية (مش فشل)', async ({ page }) => {
  // `l-1`, `ex-1`, `a-1`, `sn-1` كلها متسلسلة ومتوقّعة — مذكور صراحة
  // في MISSION §7: «لو الـids متوقّعة، سجّلها كملاحظة للباك» مش اختبار
  // فاشل. موثّق هنا كدليل حي + في reports/BUTTON-MATRIX.md/FINDINGS.md.
  await page.goto(ADMIN + '/listings', { waitUntil: 'networkidle' });
  const ids = await page
    .locator('tr[data-row-id]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-row-id')));
  const sequential = ids.filter((id) => /^l-\d+$/.test(id ?? ''));
  test.info().annotations.push({
    type: 'note',
    description: `${sequential.length}/${ids.length} id متسلسل رقميًا (l-N) — سهل التخمين، موثّق كـFND-052`,
  });
});
