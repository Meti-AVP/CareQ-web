/**
 * نقطة واحدة لرصد أخطاء الرندر — عشان أي تكامل رصد يتحط هنا بس، مش
 * متوزّع في عشرات الملفات (المرحلة ٨ بند ٥). حاليًا Sentry (موافق عليه
 * صراحة)؛ بلا `NEXT_PUBLIC_SENTRY_DSN` بيبقى no-op آمن (`sentry-shared.ts`).
 *
 * `import()` ديناميكي عمدًا — الملف ده متستدعى من `error.tsx`، وده جزء
 * من الحزمة الحرجة لكل صفحة (error boundary لازم يكون جاهز قبل أي
 * وقوع، مش على الطلب). لو استوردنا `@sentry/nextjs` مباشرة هنا كنا
 * هنلغي فايدة التحميل الكسول في `instrumentation-client.ts`.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[carq-dealers] خطأ اتلقط:', error);
  void import('@sentry/nextjs').then(({ captureException }) => {
    captureException(error, context ? { extra: context } : undefined);
  });
}
