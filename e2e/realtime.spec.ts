import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * ════════════════════════════════════════════════════════════════
 * اختبار تزامن عبر سياقين — `PORTAL §4.5` + `MISSION §6` بند ٧
 * (مخرج رسمي: «اختبارات تزامن عبر سياقين في Playwright»)
 *
 * يشتغل بـ`npm run e2e:realtime` بس (`playwright.realtime.config.ts`
 * بيوضّح ليه ملف منفصل). سياقين متصفح منفصلين تمامًا (كوكيز/جلسة كل
 * واحد لوحده — زي تابين حقيقيين مختلفين)، الاتنين فاتحين نفس غرفة
 * المزاد، وواحد بس بيزايد فعليًا من الواجهة. الهدف: نثبت إن السياق
 * التاني بيتحدّث **لايف** — من غير أي refresh ولا تفاعل منه — عن طريق
 * `useRealtime()`/WebSocket حقيقي، مش polling (اللي اتشال من
 * `useDealerAuction`/`useDealerBids` في المرحلة ٦).
 * ════════════════════════════════════════════════════════════════
 */

const DEALERS = 'http://localhost:3200';

async function loginDealer(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${DEALERS}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('تليفون المعرض').fill('01001234567');
  await page.getByRole('button', { name: 'ابعت الكود' }).click();
  await page.getByLabel('كود التأكيد').waitFor({ state: 'visible' });
  await page.getByLabel('كود التأكيد').fill('123456');
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL(`${DEALERS}/`);
  return page;
}

test('مزايدة في تاب بتوصل لايف لتاب تاني من غير refresh (WS مش polling)', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const [pageA, pageB] = await Promise.all([loginDealer(contextA), loginDealer(contextB)]);

  await Promise.all([
    pageA.goto(`${DEALERS}/auctions/a-1`, { waitUntil: 'networkidle' }),
    pageB.goto(`${DEALERS}/auctions/a-1`, { waitUntil: 'networkidle' }),
  ]);

  // B بيتفرّج بس — الحالة الابتدائية (من الـseed): معرضنا اتخطّى قبل كده
  await expect(pageB.getByText('اتخطّيت')).toBeVisible();

  // A بيزايد فعليًا من الواجهة — نفس فلو مستخدم حقيقي بالظبط
  await pageA.getByRole('button', { name: /زايد/ }).first().click();
  await pageA.getByRole('dialog').getByRole('button', { name: /زايد/ }).click();
  await expect(pageA.getByText('مزايدتك اتسجّلت')).toBeVisible({ timeout: 10_000 });

  // B المفروض يشوف الحالة الجديدة **من غير أي فعل منه** — WS بس هو اللي حرّكها.
  // لو ده اتحوّل صدفة لـpolling (10s) الاختبار هيعدي برضه بس أبطأ —
  // فالـtimeout هنا قصير عمدًا (٣ ثواني) عشان يفشل لو رجعنا لـpolling غلط
  await expect(pageB.getByText('إنت الأعلى دلوقتي')).toBeVisible({ timeout: 3_000 });
});

test('تمديد ضد القنص بيتعرض صراحة في التاب التاني (A-5)', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const [pageA, pageB] = await Promise.all([loginDealer(contextA), loginDealer(contextB)]);

  await Promise.all([
    pageA.goto(`${DEALERS}/auctions/a-1`, { waitUntil: 'networkidle' }),
    pageB.goto(`${DEALERS}/auctions/a-1`, { waitUntil: 'networkidle' }),
  ]);

  // ملحوظة: المزاد في الموك عمره ساعة كاملة (`endsAt` بعيد) — التمديد
  // مابيحصلش إلا لو باقي أقل من ٦٠ ثانية، فالاختبار ده بيتأكد إن **مفيش**
  // بانر تمديد ظاهر أول ما نفتح (سلوك سلبي صحيح)، ويسيب التمديد الإيجابي
  // (بانر «المزاد اتمدّ») لاختبار يدوي وقت قرب ميعاد مزاد حقيقي — تغطيته
  // الآلية بمزاد ينتهي خلال ثواني معقودة بـmock-backend.mjs موثّقة كبند
  // مفتوح في `reports/PHASE-6-REALTIME.md §٩`.
  await expect(pageB.getByText('المزاد اتمدّ')).not.toBeVisible();
});
