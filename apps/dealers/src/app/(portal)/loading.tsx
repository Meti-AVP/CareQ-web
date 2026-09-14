import { Sheet, Skeleton } from '@carq/ui';

/**
 * `loading.tsx` — شكل عام أثناء التنقّل بين شاشات `(portal)` (المرحلة ٨).
 * عام عمدًا (مش شكل جدول ولا شكل داشبورد بالذات) لأنه بيغطّي كل الشاشات
 * تحت الـroute group ده؛ كل شاشة أصلًا عندها `Skeleton`/`TableSkeleton`
 * أدق لحالتها الخاصة (اللودينج بتاع الاستعلام نفسه، مش التنقّل).
 */
export default function PortalLoading() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-line bg-ink px-6 py-8 sm:px-8">
        <Skeleton className="h-7 w-48 bg-white/10" />
        <Skeleton className="mt-3 h-4 w-72 bg-white/10" />
      </div>
      <Sheet>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="mt-6 h-80 w-full" />
      </Sheet>
    </div>
  );
}
