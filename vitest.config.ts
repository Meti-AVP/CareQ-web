import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * إعداد vitest — اختبارات الوحدات بتجري على مصدر الحزم مباشرة
 * (نفس أسلوب transpilePackages في Next): مفيش خطوة build قبل الاختبار.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@carq/ui': fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url)),
      '@carq/api-client': fileURLToPath(
        new URL('./packages/api-client/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts', 'apps/**/__tests__/**/*.test.ts'],
    // كل ملف اختبار بياخد نسخة module registry نضيفة — مهم لأن
    // mock db حالة مشتركة على مستوى الموديول
    isolate: true,
  },
});
