/**
 * ════════════════════════════════════════════════════════════════
 * الدخول بجوجل — سيرفر بس (Route Handlers)
 *
 * خيار إضافي جنب OTP، مش بديل عنه (`docs/AUTH.md §7`). بيتشارك نفس
 * آلية الجلسة بالظبط (`server/session.ts`) — بعد نجاح جوجل، بنكتب
 * نفس كوكي الـrefresh اللي OTP بيكتبه، وبعدها كل حاجة (`SessionProvider`،
 * `middleware.ts`، التجديد الصامت) بتشتغل زي ما هي من غير أي تغيير.
 *
 * **الفلو (Authorization Code، من غير أي مكتبة/SDK):**
 *   1) `GET /api/auth/google` — بيولّد `state` عشوائي (CSRF)، يحطه في
 *      كوكي قصيرة العمر، ويحوّل لصفحة موافقة جوجل.
 *   2) المستخدم بيوافق في جوجل، جوجل بيرجّعه لـ
 *      `GET /api/auth/google/callback?code=...&state=...`.
 *   3) بنتأكد إن `state` مطابق (نفس الكوكي)، وبعدين نبادل الـ`code`
 *      بتوكنات من سيرفر جوجل (نداء سيرفر-لسيرفر — `client_secret`
 *      عمره ما يوصل للمتصفح)، وناخد بيانات الحساب (إيميل/اسم).
 *   4) وضع الموك (مفيش `NEXT_PUBLIC_API_URL`): زي أي دخول ديمو —
 *      أي حساب جوجل بيعدّي، وبياخد نفس هوية الديمو الثابتة بتاعة
 *      اللوحة دي (تمامًا زي «أي رقم مصري وأي كود» في OTP — `DEMO_MODE`).
 *   5) باك اند حقيقي: بنبعت إيميل/معرّف جوجل لـ`POST /v1/auth/google`
 *      (endpoint جديد مطلوب — `docs/BACKEND-CONTRACT.md §1`)، ونتوقع
 *      نفس شكل رد `verifyOtp` بالظبط (`{access_token, refresh_token, user}`).
 *      فحص الدور (`role !== requiredRole` ⇒ رفض) بيحصل هنا زي OTP بالظبط.
 * ════════════════════════════════════════════════════════════════
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { UserRole } from '../types';

const STATE_COOKIE = 'cq_google_oauth_state';
const STATE_MAX_AGE_SECONDS = 300; // ٥ دقايق — كفاية لفلو موافقة جوجل كامل

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // نفس مدة كوكي الجلسة العادية (I-4)

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  };
}

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function loginRedirect(req: Request, error: string): NextResponse {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

/**
 * `sessionCookieName`: اسم كوكي الجلسة بتاع التطبيق ده (`cq_session_admin`
 * أو `cq_session_dealers`) — نفس الاسم اللي `createSessionHandlers`
 * بتستخدمه، عشان جوجل وOTP يكتبوا في نفس الكوكي بالظبط.
 * `requiredRole`: الدور المطلوب للوحة دي — نفس معنى `verifyOtp(requiredRole)`.
 */
export function createGoogleOAuthHandlers(sessionCookieName: string, requiredRole: UserRole) {
  async function handleGoogleStart(req: Request): Promise<Response> {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const demoMode = !apiUrl && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
    if (!apiUrl && !demoMode) {
      // نفس بوابة إغلاق الديمو بتاعة OTP بالحرف (`DEMO_MODE` في `client.ts`)
      // — لو حد قفلها صراحة في بيئة موك مشتركة، جوجل لازم يتقفل معاها
      return loginRedirect(req, 'google_demo_closed');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      // لسه ماتحطش المفاتيح — رسالة واضحة بدل ما جوجل يرفض بصمت
      return loginRedirect(req, 'google_not_configured');
    }

    const state = randomState();
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_MAX_AGE_SECONDS,
    });

    const redirectUri = new URL('/api/auth/google/callback', req.url).toString();
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    // بيرجّع اختيار الحساب دايمًا — من غيره جوجل ممكن يعدّي على طول
    // بحساب متسجّل قبل كده من غير ما يسأل، وده مربك في تطبيق فيه أكتر
    // من دور (أدمن/معرض) على نفس الجهاز
    authUrl.searchParams.set('prompt', 'select_account');

    return NextResponse.redirect(authUrl.toString());
  }

  async function handleGoogleCallback(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const error = url.searchParams.get('error');
    if (error) return loginRedirect(req, 'google_cancelled');

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const jar = await cookies();
    const expectedState = jar.get(STATE_COOKIE)?.value;
    jar.delete(STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      return loginRedirect(req, 'google_failed');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return loginRedirect(req, 'google_not_configured');

    try {
      const redirectUri = new URL('/api/auth/google/callback', req.url).toString();
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) return loginRedirect(req, 'google_failed');
      const tokens = (await tokenRes.json()) as { access_token: string };

      const profileRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileRes.ok) return loginRedirect(req, 'google_failed');
      const profile = (await profileRes.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      if (!profile.email || profile.email_verified === false) {
        return loginRedirect(req, 'google_failed');
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        // وضع الموك — نفس فلسفة OTP الديمو بالحرف: أي حساب جوجل بيعدّي
        // ويدخل بهوية الديمو الثابتة بتاعة اللوحة دي (docs/AUTH.md §2)
        const demoRefresh = `demo-refresh-google-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        jar.set(sessionCookieName, demoRefresh, sessionCookieOptions());
        return NextResponse.redirect(new URL('/', req.url));
      }

      // باك اند حقيقي — endpoint جديد مطلوب (docs/BACKEND-CONTRACT.md §1)
      const authRes = await fetch(`${apiUrl}/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email, googleId: profile.sub, name: profile.name }),
      });
      if (!authRes.ok) return loginRedirect(req, 'google_failed');
      const data = (await authRes.json()) as {
        access_token: string;
        refresh_token: string;
        user: { role: UserRole };
      };
      if (data.user.role !== requiredRole) {
        // نفس رفض OTP بالحرف — من غير ما نقول إن فيه لوحة أصلًا (X-2)
        return loginRedirect(req, 'google_forbidden');
      }
      jar.set(sessionCookieName, data.refresh_token, sessionCookieOptions());
      return NextResponse.redirect(new URL('/', req.url));
    } catch {
      return loginRedirect(req, 'google_failed');
    }
  }

  return { handleGoogleStart, handleGoogleCallback };
}
