import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * ════════════════════════════════════════════════════════════════
 * حارس المسارات — بوابة المعارض (المرحلة ٢)
 *
 * المسارات العامة: `/login` و`/apply` و`/apply/status` (عن قصد —
 * `PORTAL §2`: طلب الترقية بتاع فرد لسه ملوش حساب معرض). أي حاجة
 * تانية (`(portal)/*`) محتاجة كوكي جلسة صالح.
 *
 * فحص **وجود** الكوكي بس هنا — فحص **صلاحية** الجلسة (هل هي لمعرض
 * حقيقي؟) بيحصل بعد كده في `SessionProvider` (`GET /v1/me`)، ونفس
 * فحص الكوكي بيتكرر سيرفر-سايد في `(portal)/layout.tsx` كدفاع مزدوج.
 * ════════════════════════════════════════════════════════════════
 */

const PUBLIC_PATHS = ['/login', '/apply'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    if (pathname === '/login' && authed) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (!authed) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
