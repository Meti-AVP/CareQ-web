'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button, PageHeader, Sheet } from '@carq/ui';
import { reportError } from '@/lib/report-error';

/**
 * ════════════════════════════════════════════════════════════════
 * `error.tsx` — حد أمان لأي صفحة تحت `(portal)` بتقع أثناء الرندر
 * (المرحلة ٨ — المتانة)
 *
 * الملف ده جوه الـroute group، فـ`layout.tsx` (وبالتالي `Shell` —
 * الشريط الجانبي والهيدر) بيفضل شغّال حوليه؛ الصفحة الوحيدة اللي بتوقّع
 * هي اللي وقعت. رسم بياني واحد بيقع مايوقّعش الداشبورد كله — نفس المبدأ
 * (`ChartFrame` بتاعت كل رسم عندها error boundary مستقل خاص بيها كمان).
 *
 * `error.tsx` **لازم** يكون Client Component (متطلب Next.js نفسه).
 * ════════════════════════════════════════════════════════════════
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: 'portal-error-boundary' });
  }, [error]);

  return (
    <div className="min-h-screen bg-canvas">
      <PageHeader
        title="الصفحة دي وقعت"
        subtitle="باقي بوابة المعارض شغّالة عادي — جرّب تفتح الصفحة تاني"
        motif="swoosh"
      />
      <Sheet>
        <div className="mx-auto flex max-w-lg animate-rise flex-col items-center gap-4 rounded-lg border border-line bg-surface p-8 text-center shadow-card">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-crit-soft text-crit">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <p className="text-title font-bold text-content">حصل خطأ غير متوقع في الشاشة دي</p>
          <p className="text-body text-content-sub">
            الشريط الجانبي وباقي الشاشات شغّالين عادي — المشكلة في الصفحة دي بس، واتسجّلت
            تلقائيًا عشان تتراجع.
            {error.digest ? ` رقم المرجع: ${error.digest}` : ''}
          </p>
          <Button onClick={reset} icon={<RotateCw />}>
            جرّب تاني
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
