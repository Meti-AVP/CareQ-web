'use client';

/**
 * ════════════════════════════════════════════════════════════════
 * طبقة الجلسة — `SessionProvider` / `useSession()` (المرحلة ٢)
 *
 * `middleware.ts` و`layout.tsx` (سيرفر) بيمنعوا الوصول من غير كوكي
 * جلسة — الطبقة دي شغلها بعد كده: تملى التوكن في الذاكرة من جديد بعد
 * أي F5 (silent refresh)، وتقرا هوية المستخدم فعليًا (`GET /v1/me`)،
 * وتجدّد استباقيًا قبل ما التوكن ينتهي (5b)، وتتعامل مع انتهاء الجلسة
 * أثناء الاستخدام بشاشة واضحة مش إعادة توجيه صامتة.
 *
 * **مالهاش رأي في الشكل** — دي مسؤولية `Shell` في كل تطبيق. الملف ده
 * منطق بس، عشان يتحط حوالين `/login` كمان من غير ما يمنع رندرها.
 * ════════════════════════════════════════════════════════════════
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { http, USE_MOCK, tokenStore, refreshSession } from './client';
import { endSession } from './auth';
import { getMockIdentity } from './mock/db';
import type { User, UserRole } from './types';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'expired';

export interface SessionValue {
  user: User | null;
  role: UserRole | null;
  status: SessionStatus;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession() لازم يتنادى جوه <SessionProvider>');
  return ctx;
}

async function fetchMe(requiredRole: UserRole): Promise<User> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 80));
    return getMockIdentity(requiredRole);
  }
  return http<User>('/v1/me');
}

export function SessionProvider({
  requiredRole,
  children,
}: {
  /** الدور المتوقّع في اللوحة دي — 'admin' في apps/admin، 'exhibition' في apps/dealers */
  requiredRole: UserRole;
  children: ReactNode;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  /** null = لسه بنحاول التجديد الصامت الأول */
  const [refreshed, setRefreshed] = useState<boolean | null>(null);
  const [expired, setExpired] = useState(false);

  /* التجديد الصامت عند التحميل — مرة واحدة بس، قبل ما نقرر إن مفيش
     جلسة. من غيره أي F5 بيطلّع المستخدم بره لأن التوكن في الذاكرة بس. */
  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((ok) => {
      if (!cancelled) setRefreshed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const meQuery = useQuery<User>({
    queryKey: ['session', 'me', requiredRole],
    queryFn: () => fetchMe(requiredRole),
    enabled: refreshed === true,
    // الدور بيتقرا من الداتابيز مع كل request في الباك — متكاشيش
    // الدور في الفرونت أكتر من دقيقة (§2 ADMIN)
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  /* التجديد الاستباقي (5b) — بنراقب كل ٢٠ ثانية، ولو التوكن قرّب يخلص
     (أقل من دقيقة) بنجدّده قبل ما أي نداء يوصله ويقع في 401. بيستخدم
     نفس قفل الـsingle-flight في `refreshSession()`، فلو نداء API عادي
     استعجل وجدّد لوحده في نفس اللحظة، الاتنين بيشاركوا نفس الطلب. */
  useEffect(() => {
    if (refreshed !== true) return;
    const id = setInterval(() => {
      if (tokenStore.isExpiring()) void refreshSession();
    }, 20_000);
    return () => clearInterval(id);
  }, [refreshed]);

  /* الدور غلط للوحة دي — امسح كل حاجة، من غير ما تقول إن فيه لوحة أصلًا */
  useEffect(() => {
    if (meQuery.data && meQuery.data.role !== requiredRole) {
      tokenStore.clear();
      qc.clear();
    }
  }, [meQuery.data, requiredRole, qc]);

  /* انتهاء الجلسة أثناء الاستخدام (401 نهائي بعد فشل التجديد) —
     `http()` بيبعت الحدث ده. شاشة واضحة، مش إعادة توجيه صامتة. */
  useEffect(() => {
    function onExpired() {
      setExpired(true);
    }
    window.addEventListener('carq:session-expired', onExpired);
    return () => window.removeEventListener('carq:session-expired', onExpired);
  }, []);

  const status: SessionStatus = expired
    ? 'expired'
    : refreshed === null
      ? 'loading'
      : refreshed === false
        ? 'unauthenticated'
        : meQuery.data
          ? meQuery.data.role === requiredRole
            ? 'authenticated'
            : 'unauthenticated'
          : meQuery.isError
            ? 'unauthenticated'
            : 'loading';

  /* مفيش جلسة صالحة — ارجع لصفحة الدخول. middleware.ts بيمنع الوصول
     المباشر أصلًا؛ ده شبكة أمان إضافية للحالة النادرة إن الجلسة بتقع
     أثناء ما صفحة محمية شغالة already. */
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const logout = async () => {
    await endSession();
    qc.clear();
    setExpired(false);
    setRefreshed(false);
    router.push('/login');
  };

  return (
    <SessionContext.Provider
      value={{
        user: status === 'authenticated' ? (meQuery.data ?? null) : null,
        role: status === 'authenticated' ? (meQuery.data?.role ?? null) : null,
        status,
        isLoading: status === 'loading',
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
