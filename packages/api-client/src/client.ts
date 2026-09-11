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
 * التوكن **في الذاكرة بس** — مش localStorage (ADMIN_DASHBOARD_SPEC §2).
 * لوحة فيها أرقام تليفونات وصور بطاقات، وأي XSS بيقرا localStorage.
 * التوكن الدائم (refresh) بيتحفظ في httpOnly cookie من route handler
 * على السيرفر، والصفحة بتجدّد منه بصمت عند التحميل.
 */
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export const tokenStore = {
  set(token: string, expiresInSeconds: number) {
    accessToken = token;
    tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  },
  get() {
    return accessToken;
  },
  clear() {
    accessToken = null;
    tokenExpiresAt = 0;
  },
  isExpiring() {
    return tokenExpiresAt - Date.now() < 60_000;
  },
};

/** مفتاح idempotency لكل POST بيُنشئ — إجباري (X-3) */
export function idempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface HttpOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** بيتبعت كـIdempotency-Key header */
  idempotency?: string;
  /** عدد محاولات التجديد — داخلي */
  _retried?: boolean;
}

async function refreshToken(): Promise<boolean> {
  try {
    // الكوكي httpOnly بتتبعت تلقائي — الـroute handler بيرد بتوكن جديد
    const res = await fetch('/api/session/refresh', { method: 'POST' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; expiresIn: number };
    tokenStore.set(data.accessToken, data.expiresIn);
    return true;
  } catch {
    return false;
  }
}

/**
 * نداء الـAPI. عند 401: **بيجدّد مرة واحدة بس** ويعيد المحاولة،
 * وبعدها بيطلع — نفس منطق `src/api/client.ts` في الموبايل.
 */
export async function http<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const { body, idempotency, _retried, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401 && !_retried) {
    const ok = await refreshToken();
    if (ok) return http<T>(path, { ...options, _retried: true });
    tokenStore.clear();
    throw new ApiError('NOT_AUTHENTICATED', 'الجلسة انتهت — سجّل دخول تاني', null, 401);
  }

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* الرد مش JSON */
    }
    if (parsed?.error) throw ApiError.fromBody(parsed, res.status);
    throw new ApiError('CONFLICT', 'حصل خطأ في الاتصال بالسيرفر', null, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
