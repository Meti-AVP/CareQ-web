import { expect, type Page } from '@playwright/test';

/** عناوين اللوحتين — البورتات ثابتة في package.json */
export const ADMIN = 'http://localhost:3100';
export const DEALERS = 'http://localhost:3200';

/**
 * مراقب الكونسول — بيلتقط أي error من لحظة فتح الصفحة.
 * ضوضاء التطوير المعروفة (وميض HMR وإعلان React DevTools) بتتفلتر؛
 * أي حاجة تانية بتفشّل الاختبار: صفحة نضيفة يعني كونسول نضيف.
 */
const IGNORED = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /React DevTools/i,
];

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED.some((rx) => rx.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * بيفتح الصفحة وبيستنى الشبكة تهدى، وبعدين بيتأكد من أساسيات
 * كل صفحة في المشروع: RTL، مفيش دارك ثيم، مفيش شاشة خطأ من Next.
 */
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' });

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

  // شاشة الخطأ بتاعة Next (سواء dev overlay أو صفحة الإنتاج)
  await expect(page.locator('text=Application error')).toHaveCount(0);
  await expect(page.locator('#__next-build-error')).toHaveCount(0);
}

/** بيتأكد إن الصفحة رندرت رأسها (كل صفحات المشروع فيها h1 واحد ظاهر) */
export async function expectHeading(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
}

/** فحص نهائي موحّد — بينادى آخر كل اختبار */
export function expectCleanConsole(errors: string[]): void {
  expect(errors, `أخطاء كونسول:\n${errors.join('\n')}`).toEqual([]);
}
