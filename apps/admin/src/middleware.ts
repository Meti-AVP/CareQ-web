import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * ════════════════════════════════════════════════════════════════
 * حارس المسارات — لوحة الأدمن (المرحلة ٢)
 *
 * `/login` هو المسار العام الوحيد. أي حاجة تانية (`(dash)/*`) محتاجة
 * كوكي جلسة صالح — غير كده redirect لـ`/login?next=<المسار>`.
 *
 * ده فحص **وجود** الكوكي بس (سريع، على مستوى الـedge). فحص **صلاحية**
 * الجلسة فعليًا (هل هي لأدمن حقيقي؟) بيحصل بعد كده في `SessionProvider`
 * (`GET /v1/me`) — ده المستوى التاني من الحماية، مش بديل عنه
 * (`(dash)/layout.tsx` بيعمل نفس فحص الكوكي تاني على مستوى السيرفر —
 * دفاع مزدوج، مش تكرار بلا داعي).
 * ════════════════════════════════════════════════════════════════
 */

const PUBLIC_PATHS = ['/login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    // داخل بجلسة وبيحاول يفتح /login تاني — رجّعه للوحة
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
  // مستثنيات: مسارات API (route handlers بتاعتنا)، وملفات Next الداخلية،
  // وملفات ثابتة معروفة — الميدلوير مالوش لازمة هناك
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
