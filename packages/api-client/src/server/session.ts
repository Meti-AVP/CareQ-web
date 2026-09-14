/**
 * ════════════════════════════════════════════════════════════════
 * منطق كوكي الجلسة — سيرفر بس (Route Handlers)
 *
 * مشترك بين `apps/admin` و`apps/dealers` — الـroute handlers في كل
 * تطبيق (`app/api/session/*`) عبارة عن أغلفة رفيعة حوالين الدوال دي،
 * عشان منطق الكوكي (الأعمار، التدوير) يبقى في مكان واحد.
 *
 * **اسم الكوكي مختلف لكل تطبيق** (`ADMIN_SESSION_COOKIE` /
 * `DEALERS_SESSION_COOKIE`) — عن قصد، مش زخرفة. كوكيز المتصفح بتتحدد
 * بالـhost بس، مش بالمنفذ (port)، فـ`localhost:3100` (أدمن)
 * و`localhost:3200` (معارض) بيتشاركوا نفس الـhost محليًا. لو الكوكي
 * ليها نفس الاسم في التطبيقين، دخولك كأدمن بيسيب كوكي بيتقرا كمان
 * في بوابة المعارض على نفس الجهاز (وأي e2e بيشغّل اللوحتين بنفس
 * المتصفح بيقع في نفس الفخ). في الإنتاج الدومينات مختلفة تمامًا
 * (`admin.carq.eg` / `dealers.carq.eg`) فالمشكلة دي مش موجودة أصلًا،
 * بس تسمية الكوكي مختلفة أسلم وبتخلي الاعتماد على فصل الدومين مش
 * شرط وحيد.
 *
 * **مستورد من `@carq/api-client/server` بس** — ملف منفصل عن نقطة
 * الدخول الرئيسية (`@carq/api-client`) عشان `next/headers`/`next/server`
 * (APIs سيرفر بس) ميوصلوش لحزمة العميل بالغلط.
 * ════════════════════════════════════════════════════════════════
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE = 'cq_session_admin';
export const DEALERS_SESSION_COOKIE = 'cq_session_dealers';

const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ٣٠ يوم (I-4)
const ACCESS_TTL_SECONDS = 900; // ١٥ دقيقة (I-4)

function cookieOptions() {
  return {
    httpOnly: true,
    // Secure بيمنع الكوكي يتبعت على http — في التطوير المحلي (http://localhost)
    // ده كان هيمنع الكوكي يتحفظ خالص، فمقصور على الإنتاج بس.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  };
}

function errorBody(code: string, message: string) {
  return { error: { code, message, fields: null } };
}

/**
 * دفاع إضافي ضد CSRF (المرحلة ٤) — `SameSite=Lax` وحده دفاع قوي بس
 * مش كامل ١٠٠٪ (بعض سيناريوهات التنقل من موقع تاني لسه بتاخد الكوكي
 * مع `Lax`). لو هيدر `Origin` موجود ومختلف عن أصل الطلب نفسه، ده طلب
 * cross-site واضح — نرفضه. `Origin` ممكن يكون غايب في حالات نادرة
 * (some same-origin requests قديمة، إعدادات خصوصية معينة)، فمش بنرفض
 * لمجرد غيابه — بس لو موجود ومختلف عن المتوقع.
 */
function isTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

function forbiddenOrigin(): Response {
  return NextResponse.json(errorBody('FORBIDDEN', 'الطلب مرفوض'), { status: 403 });
}

/**
 * بتتنادى مرة واحدة في كل تطبيق (`apps/<app>/src/app/api/session`) باسم
 * كوكي التطبيق ده بالذات — عشان التطبيقين مايتشاركوش نفس الكوكي محليًا.
 */
export function createSessionHandlers(cookieName: string) {
  /** POST /api/session — بيتنادى بعد OTP verify، بيكتب الـrefresh في كوكي httpOnly */
  async function handleEstablishSession(req: Request): Promise<Response> {
    if (!isTrustedOrigin(req)) return forbiddenOrigin();
    const body = (await req.json().catch(() => null)) as { refreshToken?: unknown } | null;
    const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : null;
    if (!refreshToken) {
      return NextResponse.json(errorBody('VALIDATION_ERROR', 'رمز التجديد ناقص'), { status: 400 });
    }
    const jar = await cookies();
    jar.set(cookieName, refreshToken, cookieOptions());
    return new NextResponse(null, { status: 204 });
  }

  /**
   * POST /api/session/refresh — بيقرا الكوكي، بيجدّد، بيرجّع
   * `{accessToken, expiresIn}`. ده اللي `client.ts` بينده عليه عند ٤٠١
   * أو التجديد الاستباقي.
   */
  async function handleRefreshSession(req: Request): Promise<Response> {
    if (!isTrustedOrigin(req)) return forbiddenOrigin();
    const jar = await cookies();
    const current = jar.get(cookieName)?.value;
    if (!current) {
      return NextResponse.json(errorBody('NOT_AUTHENTICATED', 'الجلسة انتهت — سجّل دخول تاني'), {
        status: 401,
      });
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      // وضع الموك — مفيش باك اند حقيقي نجدّد منه. بنولّد توكن ديمو جديد
      // ونـ«دوّر» الـrefresh (I-4: بيتدوّر مع كل استخدام) عشان سلوك
      // التدوير يتحقق حتى في الديمو، مش بس لما الباك يجهز.
      const next = `demo-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      jar.set(cookieName, next, cookieOptions());
      return NextResponse.json({
        accessToken: `demo-access-${Date.now()}`,
        expiresIn: ACCESS_TTL_SECONDS,
      });
    }

    // باك اند حقيقي — العقد الكامل (المسار، الشكل، أكواد الخطأ) موثّق في docs/AUTH.md
    try {
      const res = await fetch(`${apiUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: current }),
      });
      if (!res.ok) {
        jar.delete(cookieName);
        return NextResponse.json(errorBody('NOT_AUTHENTICATED', 'الجلسة انتهت — سجّل دخول تاني'), {
          status: 401,
        });
      }
      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
        refresh_token: string;
      };
      jar.set(cookieName, data.refresh_token, cookieOptions());
      return NextResponse.json({ accessToken: data.access_token, expiresIn: data.expires_in });
    } catch {
      return NextResponse.json(errorBody('CONFLICT', 'تعذّر الاتصال بالسيرفر — حاول تاني'), {
        status: 502,
      });
    }
  }

  /** POST /api/session/logout — بيمسح الكوكي */
  async function handleLogoutSession(req: Request): Promise<Response> {
    if (!isTrustedOrigin(req)) return forbiddenOrigin();
    const jar = await cookies();
    jar.delete(cookieName);
    return new NextResponse(null, { status: 204 });
  }

  return { handleEstablishSession, handleRefreshSession, handleLogoutSession };
}
