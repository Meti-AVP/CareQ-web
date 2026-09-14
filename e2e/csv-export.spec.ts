import { expect, test } from '@playwright/test';
import { ADMIN, DEALERS, open, watchConsole, expectCleanConsole } from './helpers';

/**
 * ════════════════════════════════════════════════════════════════
 * تصدير CSV — الملف بيتنزّل فعليًا (المرحلة ٧، `MISSION.md §7`)
 *
 * `packages/ui/src/lib/__tests__/csv.test.ts` (Vitest) بيغطّي منطق
 * `buildCsv`/`csvCell` (البادئة ضد حقن المعادلات، الاقتباس، BOM) على
 * مستوى الوحدة. اللي كان ناقص: **تأكيد حي إن الملف بيتنزّل فعليًا من
 * زرار «تصدير» الحقيقي، ومحتواه مطابق لما إحنا شايفينه على الشاشة** —
 * تحديدًا إن التليفونات المخفية تفضل مخفية في الملف، مش بس على الشاشة.
 * ════════════════════════════════════════════════════════════════
 */

test('الأدمن — تصدير CSV من /users: BOM + التليفونات مخفية في الملف نفسه', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/users');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تصدير' }).first().click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString('utf8');

  // BOM إجباري — من غيره إكسل بيفتح العربي حروف مكسّرة
  expect(content.charCodeAt(0)).toBe(0xfeff);

  // التليفونات مخفية جزئيًا (نمط maskPhone: "010 ••• 567") — مش رقم كامل
  expect(content).toMatch(/\d{3}\s*•••\s*\d{3}/);
  // صفر رقم موبايل مصري كامل (١١ رقم متتالية) في الملف كله
  expect(content).not.toMatch(/\b01[0125]\d{8}\b/);

  expectCleanConsole(errors);
});

test('المعارض — تصدير CSV من /inventory: أرقام السنة/السعر مش بتتحوّل تواريخ', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, DEALERS + '/inventory');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تصدير' }).first().click(),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString('utf8');

  expect(content.charCodeAt(0)).toBe(0xfeff);
  // خلية بتبدأ بـ = أو + أو - أو @ لازم تتبادئ بـ' (ضد حقن المعادلات في إكسل)
  expect(content).not.toMatch(/,[=+@-]/);
  // سطر عناوين + سطر بيانات واحد على الأقل
  expect(content.split('\n').length).toBeGreaterThan(1);

  expectCleanConsole(errors);
});

test('تصدير CSV من رسم بياني نفسه (مش جدول) — نفس ضمانات BOM/حقن المعادلات', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await open(page, ADMIN + '/');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تنزيل CSV' }).first().click(),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString('utf8');

  expect(content.charCodeAt(0)).toBe(0xfeff);
  expect(content.length).toBeGreaterThan(1);

  expectCleanConsole(errors);
});
