import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SessionProvider } from '@carq/api-client';
import { SESSION_COOKIE } from '@/lib/session';
import { Shell } from '@/components/Shell';

/**
 * فحص جلسة سيرفر-سايد — دفاع مزدوج مع `middleware.ts` (المرحلة ٢).
 * ده مكوّن سيرفر (مفيش 'use client')، فالفحص بيحصل قبل أي HTML
 * يتبعت للمتصفح أصلًا — مش بعد ما React يشتغل.
 *
 * `SessionProvider` متحط **هنا بس** (مش في `Providers.tsx` العام) —
 * لو اتحط عالمي بيغلف كمان `/login` و`/apply/*` (مسارات عامة مقصودة
 * حسب `PORTAL §2`)، وبيحوّلهم تلقائيًا لـ`/login` حتى وهما مش
 * محتاجين جلسة أصلًا (باج اتلقط بالدليل: `/apply` كانت بترجع 401 من
 * `/api/session/refresh` وتتحوّل لصفحة الدخول قبل ما زائر يقدر يقدّم
 * طلب معرض خالص).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)?.value) redirect('/login');

  return (
    <SessionProvider requiredRole="exhibition">
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
