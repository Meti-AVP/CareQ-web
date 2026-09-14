/**
 * ════════════════════════════════════════════════════════════════
 * فلو الدخول (OTP) — مشترك بين لوحة الأدمن وبوابة المعارض (المرحلة ٢)
 *
 * الفلو الحقيقي موجود وشغّال في الباك اند بالفعل (`PORTAL §8.1`):
 *   POST /v1/auth/otp/request   { phone }        → 204
 *   POST /v1/auth/otp/verify    { phone, code }  → { access_token, refresh_token, user }
 *   GET  /v1/me                                  → { ...user }
 *
 * إحنا بنوصّل مش بنخترع — بس مفيش باك اند متوصّل دلوقتي (`USE_MOCK`)،
 * فبنرجّع هوية ديمو ثابتة حسب الدور المطلوب للوحة دي (`requiredRole`):
 * أي رقم مصري صحيح وأي كود بيعدّي، ومكتوب صراحة في الواجهة والكونسول
 * إنه وضع ديمو (`DEMO_MODE` في `client.ts`).
 * ════════════════════════════════════════════════════════════════
 */
import { ApiError } from './errors';
import { http, USE_MOCK, DEMO_MODE, tokenStore } from './client';
import { getMockIdentity, latency } from './mock/db';
import type { User, UserRole } from './types';

/** الأكسس توكن عمره ١٥ دقيقة — في الذاكرة بس (I-4 · §2) */
const ACCESS_TOKEN_TTL_SECONDS = 900;

export interface VerifyOtpResult {
  user: User;
}

export async function requestOtp(phone: string): Promise<void> {
  if (USE_MOCK) {
    if (!DEMO_MODE) {
      throw new ApiError(
        'NOT_AUTHENTICATED',
        'وضع الديمو مقفول — لازم NEXT_PUBLIC_API_URL يتظبط للدخول الحقيقي',
        null,
        503,
      );
    }
    await latency(500);
    return;
  }
  await http<void>('/v1/auth/otp/request', { method: 'POST', body: { phone } });
}

/**
 * لو `user.role !== requiredRole` (مثلًا فرد عادي بيحاول يدخل لوحة الأدمن،
 * أو أدمن بيحاول يدخل بوابة معرض): بنمسح أي توكن اتحط ونطلع بخطأ —
 * **من غير ما نكشف إن فيه لوحة أصلًا** (`ADMIN_DASHBOARD_SPEC §2`).
 */
export async function verifyOtp(
  phone: string,
  code: string,
  requiredRole: UserRole,
): Promise<VerifyOtpResult> {
  if (USE_MOCK) {
    if (!DEMO_MODE) {
      throw new ApiError('NOT_AUTHENTICATED', 'وضع الديمو مقفول', null, 503);
    }
    if (!code || code.length < 4) {
      throw new ApiError('VALIDATION_ERROR', 'اكتب الكود كامل', null, 400);
    }
    await latency(600);
    // في وضع الديمو الهوية ثابتة حسب الدور المطلوب — إلا لو الرقم
    // اتكتب فعليًا رقم مستخدم حقيقي بدور مختلف (`getMockIdentity`)،
    // وفي الحالة دي بنرفض بنفس منطق الباك اند الحقيقي تحت — عشان
    // «دخول مرفوض» يتقدر يتاختبر e2e من غير باك اند حقيقي.
    const user = getMockIdentity(requiredRole, phone);
    if (user.role !== requiredRole) {
      tokenStore.clear();
      throw new ApiError('FORBIDDEN', 'الحساب ده مش مصرّح له', null, 403);
    }
    const refreshToken = `demo-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await establishSession(refreshToken);
    tokenStore.set(`demo-access-${Date.now()}`, ACCESS_TOKEN_TTL_SECONDS);
    return { user };
  }

  const res = await http<{ access_token: string; refresh_token: string; user: User }>(
    '/v1/auth/otp/verify',
    { method: 'POST', body: { phone, code } },
  );

  if (res.user.role !== requiredRole) {
    tokenStore.clear();
    throw new ApiError('FORBIDDEN', 'الحساب ده مش مصرّح له', null, 403);
  }

  await establishSession(res.refresh_token);
  tokenStore.set(res.access_token, ACCESS_TOKEN_TTL_SECONDS);
  return { user: res.user };
}

/**
 * POST /api/session — وسيط (route handler من عندنا، مش الباك اند
 * الخارجي — نفس الأصل بالظبط اللي الصفحة اتحمّلت منه). بيكتب الـrefresh
 * في كوكي httpOnly · Secure (إنتاج) · SameSite=Lax.
 *
 * لو الفetch نفسه فشل شبكيًا (`TypeError`، زي `ERR_CONNECTION_REFUSED`)
 * — مش رد بحالة خطأ من السيرفر — غالبًا `next dev` لسه بيعمل compile
 * أول زيارة لمسار الـAPI ده (شائع في أول تشغيل بعد تغيير كود)، فبنعيد
 * المحاولة مرة واحدة بعد نص ثانية قبل ما نستسلم. مفيش retry تاني بعدها
 * عشان فشل حقيقي (سيرفر واقف فعلًا) يفضل واضح وسريع، مش يتلخبط في حلقة.
 */
async function establishSession(refreshToken: string): Promise<void> {
  const attempt = () =>
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });

  let res: Response;
  try {
    res = await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    try {
      res = await attempt();
    } catch {
      throw new ApiError(
        'CONFLICT',
        'مقدرناش نوصل لسيرفر التطبيق نفسه (مش الباك اند) — لو ده أول تشغيل، استنى شوية والصفحة هتتصل. لو الصفحة شغّالة قبل كده، اتأكد إن npm run dev لسه شغّال',
        null,
        0,
      );
    }
  }
  if (!res.ok) {
    throw new ApiError('CONFLICT', 'تعذّر إنشاء الجلسة — حاول تاني', null, res.status);
  }
}

/** خروج — بيمسح التوكن من الذاكرة وكوكي الجلسة (السيرفر بيمسحها فعليًا) */
export async function endSession(): Promise<void> {
  tokenStore.clear();
  try {
    await fetch('/api/session/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* فشل الطلب مش قاطع — الكوكي عمرها محدود أصلًا */
  }
}
