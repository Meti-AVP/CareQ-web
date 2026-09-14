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
 * لأن `/login` بره الـgroup ده أصلًا ومش محتاجه (بتنادي `requestOtp`/
 * `verifyOtp` مباشرة). لو اتحط عالمي، أي صفحة عامة تتضاف بعدين
 * (زي `apply/*` في بوابة المعارض) هتتحوّل لـ`/login` تلقائيًا حتى
 * وهي مش محتاجة جلسة أصلًا (باج اتلقط بالظبط في بوابة المعارض).
 */
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!jar.get(SESSION_COOKIE)?.value) redirect('/login');

  return (
    <SessionProvider requiredRole="admin">
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
