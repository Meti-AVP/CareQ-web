import { chromium } from '@playwright/test';
import { ADMIN, DEALERS } from './helpers';

/**
 * ════════════════════════════════════════════════════════════════
 * إعداد عام — تسجيل دخول حقيقي مرة واحدة للوحتين (المرحلة ٢)
 *
 * من دلوقتي كل مسار محمي محتاج جلسة صالحة (middleware.ts). بدل ما كل
 * اختبار يعمل فلو الدخول لوحده (بطيء ومكرر)، بنسجّل دخول مرة واحدة
 * هنا وبنحفظ الكوكيز (httpOnly `cq_session_admin` / `cq_session_dealers`
 * — اسم مختلف لكل تطبيق، `docs/AUTH.md`) في `storageState` —
 * Playwright بيقدر يحفظ ويرجّع كوكيز httpOnly عادي (عن طريق CDP، مش
 * `document.cookie`)، فده بيشتغل صح.
 *
 * التوكن اللي في الذاكرة (`tokenStore`) مش بيتحفظ (مفيش داعي —
 * `SessionProvider` بيعمل تجديد صامت من نفس الكوكي عند أول تحميل).
 *
 * الاختبارات اللي محتاجة تبدأ من غير جلسة (فلو الدخول نفسه، حراسة
 * المسارات) بتعمل override بـ`test.use({ storageState: { cookies: [], origins: [] } })`.
 * ════════════════════════════════════════════════════════════════
 */
export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // ───── لوحة الأدمن: تليفون + ٤ أرقام ─────
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="tel"]').fill('01001234567');
  await page.getByRole('button', { name: /ابعت كود/ }).click();
  // لازم نستنى خطوة الكود فعليًا قبل ما نلاقي الخانات — حقل التليفون
  // نفسه `inputmode="numeric"` كمان، فلو استعجلنا هنلاقي عنصر واحد بس
  // (التليفون لسه ظاهر) ونعبّي فيه بالغلط بدل خانات الكود.
  await page.getByText('اكتب الكود').waitFor({ state: 'visible' });
  const otpBoxes = page.locator('input[inputmode="numeric"]');
  await otpBoxes.first().waitFor({ state: 'visible' });
  for (let i = 0; i < 4; i++) await otpBoxes.nth(i).fill(String(i + 1));
  await page.getByRole('button', { name: /ادخل على اللوحة/ }).click();
  await page.waitForURL(`${ADMIN}/`);

  // ───── بوابة المعارض: تليفون + ٦ أرقام ─────
  await page.goto(`${DEALERS}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('تليفون المعرض').fill('01001234567');
  await page.getByRole('button', { name: 'ابعت الكود' }).click();
  await page.getByLabel('كود التأكيد').waitFor({ state: 'visible' });
  await page.getByLabel('كود التأكيد').fill('123456');
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL(`${DEALERS}/`);

  await context.storageState({ path: 'e2e/.auth/state.json' });
  await browser.close();
}
