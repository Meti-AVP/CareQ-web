/**
 * ════════════════════════════════════════════════════════════════
 * عميل الـHTTP — **نقطة التبديل الوحيدة** بين الموك والباك اند
 *
 * كل الـhooks بتنادي `http()`. لما الباك يجهز:
 *   ١) حط `NEXT_PUBLIC_API_URL` في البيئة
 *   ٢) شغّل `openapi-typescript` وبدّل `types.ts`
 *   ٣) خلاص — ولا شاشة واحدة بتتغير
 * ════════════════════════════════════════════════════════════════
 */
import { ApiError } from './errors';
import type { ApiErrorBody } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/** وضع الموك شغال طول ما مفيش عنوان API */
export const USE_MOCK = API_URL.length === 0;

/**
 * وضع الديمو — بوابة الدخول الوهمي (أي رقم مصري صحيح + أي كود بيعدّي).
 * **مفيش افتراضي صامت**: لازم `USE_MOCK` أصلًا (مفيش عنوان API) *و*
 * `NEXT_PUBLIC_DEMO_MODE` متحطّاش صراحة بـ`'false'`. بيتقفل تلقائيًا
 * أول ما `NEXT_PUBLIC_API_URL` يتحط (لأن `USE_MOCK` بيبقى `false`).
 */
export const DEMO_MODE = USE_MOCK && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

if (typeof window !== 'undefined' && DEMO_MODE) {
  console.warn(
    '[CarQ] وضع الديمو مفعّل — أي رقم مصري صحيح وأي كود دخول بيعدّي. ' +
      'هيتقفل تلقائيًا أول ما NEXT_PUBLIC_API_URL يتحط في بيئة التشغيل.',
  );
}

/**
 * التوكن **في الذاكرة بس** — مش localStorage (ADMIN_DASHBOARD_SPEC §2).
 * لوحة فيها أرقام تليفونات وصور بطاقات، وأي XSS بيقرا localStorage.
 * التوكن الدائم (refresh) بيتحفظ في httpOnly cookie من route handler
 * على السيرفر، والصفحة بتجدّد منه بصمت عند التحميل.
 */
let accessToken: string | null = null;
let tokenExpiresAt = 0;
/** مستمعين لتغيّر التوكن — `realtime.ts` بيستخدمها عشان يجدّد `auth` على
 * سوكت شغّال لما `refreshSession()` يجيب توكن جديد (R-4)، من غير ما
 * يحتاج يعمل polling على `tokenStore.get()`. */
const tokenListeners = new Set<(token: string | null) => void>();

export const tokenStore = {
  set(token: string, expiresInSeconds: number) {
    accessToken = token;
    tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
    for (const listener of tokenListeners) listener(token);
  },
  get() {
    return accessToken;
  },
  clear() {
    accessToken = null;
    tokenExpiresAt = 0;
    for (const listener of tokenListeners) listener(null);
  },
  isExpiring() {
    return tokenExpiresAt - Date.now() < 60_000;
  },
  /** بيترجّع دالة إلغاء الاشتراك. */
  onChange(listener: (token: string | null) => void): () => void {
    tokenListeners.add(listener);
    return () => tokenListeners.delete(listener);
  },
};

/** عنوان الـWebSocket — نفس `API_URL` بس بروتوكول `ws(s)` بدل `http(s)` (`PORTAL §4.5`, `ADMIN §9`). */
export const WS_URL = API_URL.replace(/^http/, 'ws');

/**
 * `refetchInterval` بيوقف لما التاب مش ظاهر (`MISSION §6` بند ٦) —
 * تاب مقفول فاتح على ٢٠ معرض بيعمل بولينج كل ١٠ ثواني = ضغط مجاني على
 * الباك من غير أي مستخدم شايف النتيجة. `document.hidden` بيتقرا وقت كل
 * تشيك (مش وقت الإنشاء) عشان يعكس حالة التاب الحالية صح.
 *
 * الاستخدام: `refetchInterval: visibleRefetchInterval(20_000)` بدل رقم
 * ثابت — لو التاب مخفي بيرجّع `false` (TanStack بيوقف الجدولة تمامًا)،
 * وبيرجع يجدول تاني لوحده أول ما `refetchOnWindowFocus`/الرجوع للتاب
 * يحصّل query جديدة.
 */
export function visibleRefetchInterval(ms: number): () => number | false {
  return () => (typeof document !== 'undefined' && document.hidden ? false : ms);
}

/** مفتاح idempotency لكل POST بيُنشئ — إجباري (X-3) */
export function idempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * كاش مفاتيح idempotency **ثابتة عبر إعادة المحاولة لنفس العملية
 * المنطقية** (X-3). `idempotencyKey()` الخام بترجّع مفتاح عشوائي جديد
 * مع كل نداء — يعني إعادة محاولة (فشل شبكة، دوسة تانية سريعة على
 * الزرار) بتاخد مفتاح مختلف، فالعملية بتتنفّذ مرتين بالظبط اللي
 * الـidempotency موجودة عشان تمنعه (اتلقط في مراجعة المرحلة ٥).
 *
 * الاستخدام: `keys.get(id)` بترجّع نفس المفتاح طول ما `id` (أو أي
 * تركيبة بتميّز العملية، زي `${auctionId}:${amount}` لمزايدة بمبلغ
 * مختلف) لسه معلّق؛ `keys.clear(id)` بعد النجاح عشان عملية منطقية
 * تالية بنفس الـid تاخد مفتاح جديد. عادةً بتُلف بـ`useRef` في الـhook
 * عشان تفضل نفس النسخة عبر إعادة الرندر.
 */
export class IdempotencyKeyCache {
  private readonly keys = new Map<string, string>();
  constructor(private readonly prefix: string) {}

  get(disambiguator: string): string {
    let key = this.keys.get(disambiguator);
    if (!key) {
      key = idempotencyKey(`${this.prefix}-${disambiguator}`);
      this.keys.set(disambiguator, key);
    }
    return key;
  }

  clear(disambiguator: string): void {
    this.keys.delete(disambiguator);
  }
}

interface HttpOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** بيتبعت كـIdempotency-Key header */
  idempotency?: string;
  /** عدد محاولات التجديد — داخلي */
  _retried?: boolean;
  /** نفس رقم المرجع عبر إعادة محاولة الـ٤٠١ الشفافة — داخلي */
  _requestId?: string;
  /** مهلة النداء — بالميلي ثانية. افتراضي `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** UUID بسيط — بديل لـ`crypto.randomUUID()` في بيئات مالهاش الدالة دي */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ٢٠ ثانية — كافية لمعظم النداءات التفاعلية من غير ما تعلّق للأبد */
const DEFAULT_TIMEOUT_MS = 20_000;
/** مهلة أطول للتقارير/الإحصائيات الثقيلة — الشاشات دي بتمرّرها صراحة */
export const REPORT_TIMEOUT_MS = 45_000;

/**
 * قفل تجديد واحد مشترك (single-flight) — لو عدة طلبات اتفاجئوا بـ401
 * في نفس اللحظة (تابات متوازية، شاشة فيها كذا query)، كلهم بيستنوا نفس
 * نداء التجديد بدل ما كل واحد يعمل نداءه لوحده (5b).
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      // الكوكي httpOnly بتتبعت تلقائي — الـroute handler بيرد بتوكن جديد
      const res = await fetch('/api/session/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; expiresIn: number };
      tokenStore.set(data.accessToken, data.expiresIn);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** بتتصدّر لـ`SessionProvider` عشان التجديد الاستباقي (5b) والخروج */
export const refreshSession = refreshToken;

/**
 * نداء الـAPI. عند 401: **بيجدّد مرة واحدة بس** ويعيد المحاولة،
 * وبعدها بيطلع — نفس منطق `src/api/client.ts` في الموبايل.
 *
 * كل نداء له مهلة (`timeoutMs`) عشان طلب معلّق ميفضلش سبينر للأبد (6b) —
 * الغاء تلقائي بـ`AbortController`، ومدموج مع أي `signal` بيبعته المنادي
 * (زي إلغاء React Query عند فك تركيب المكوّن).
 *
 * كل نداء معاه `X-Request-Id` مولّد محليًا (`MISSION.md §5.5d`) — لو
 * فشل، الـid ده بيتلحق برسالة الخطأ (`errorMessage()`) عشان لو معرض
 * اشتكى من طلب فشل، تقدر تلاقيه في لوج الباك (الباك لازم يسجّله
 * ويرجّعه في رد الخطأ — موثّق في `docs/BACKEND-CONTRACT.md`).
 */
export async function http<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const {
    body,
    idempotency,
    _retried,
    _requestId,
    headers,
    signal: callerSignal,
    timeoutMs,
    ...rest
  } = options;
  const requestId = _requestId ?? generateRequestId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  // FormData (رفع ملفات) — الكروم بيبني حد الـmultipart بنفسه، فمينفعش
  // نحدد Content-Type إحنا ولا نعمل JSON.stringify (كان ده الباج: رفع
  // الصور كان بيبعت idempotency-key بس من غير أي بايتات ملف فعلية)
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
        'X-Request-Id': requestId,
        ...headers,
      },
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
      // الباك اند بيتحقق بالـBearer token مش الكوكي — الكوكي بيننا وبين
      // route handler بتاعنا بس، عابر أصل (same-origin) فمحتاجش 'include'
      // لنداء API خارجي، وده بيبسّط متطلبات CORS على الباك (§CORS في docs/AUTH.md)
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(
        'CONFLICT',
        'الطلب أخد وقت أطول من المتوقع — تأكد من اتصالك وحاول تاني',
        null,
        408,
        requestId,
      );
    }
    throw new ApiError(
      'CONFLICT',
      'تعذّر الاتصال بالسيرفر — تأكد من اتصالك وحاول تاني',
      null,
      0,
      requestId,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && !_retried) {
    const ok = await refreshToken();
    if (ok) return http<T>(path, { ...options, _retried: true, _requestId: requestId });
    tokenStore.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('carq:session-expired'));
    }
    throw new ApiError('NOT_AUTHENTICATED', 'الجلسة انتهت — سجّل دخول تاني', null, 401, requestId);
  }

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* الرد مش JSON */
    }
    // لو الباك رجّع نفس المعرّف (موصّى بيه — docs/BACKEND-CONTRACT.md)
    // نستخدمه هو، غير كده نفضل على المولّد محليًا
    const serverRequestId = res.headers.get('x-request-id');
    if (parsed?.error) throw ApiError.fromBody(parsed, res.status, serverRequestId ?? requestId);
    throw new ApiError('CONFLICT', 'حصل خطأ في الاتصال بالسيرفر', null, res.status, serverRequestId ?? requestId);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
