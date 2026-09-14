/**
 * ════════════════════════════════════════════════════════════════
 * إعدادات Sentry المشتركة بين كل نقاط الدخول (كلاينت/سيرفر/edge)
 * — المرحلة ٨ بند ٥ (الرصد والملاحظة)
 *
 * قاعدة إلزامية من `MISSION.md`: **ممنوع نبعت أرقام تليفونات ولا صور
 * بطاقات ولا توكنز في تقرير الخطأ**. رسائل الأخطاء في المشروع كلها
 * نصوص عربية عامة (`ApiError.message`) مفيهاش بيانات شخصية مضمّنة
 * أصلًا (راجع `packages/api-client/src/errors.ts`) — لكن `beforeSend`
 * هنا خط دفاع إضافي (defense in depth) بيرفض أي حدث لسه فيه رقم
 * تليفون مصري ظاهر بالغلط (مثلًا داخل breadcrumb من نص شاشة).
 *
 * بلا DSN (`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` مش متظبطين): الـSDK
 * بيتحمّل عادي بس مبيبعتش أي حاجة — نفس نمط المرونة المستخدم مع جوجل
 * أوث (`docs/AUTH.md`). محتاج حساب Sentry وDSN حقيقي عشان يشتغل فعليًا.
 * ════════════════════════════════════════════════════════════════
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/** ٠١ + رقم شبكة مصري (٠/١/٢/٥) + ٨ أرقام — بصيغ محلية أو دولية */
const EGYPT_PHONE_RE = /(?:\+?20|0)1[0125]\d{8}/g;

function scrubPhones<T>(value: T): T {
  if (typeof value === 'string') return value.replace(EGYPT_PHONE_RE, '[رقم محجوب]') as unknown as T;
  if (Array.isArray(value)) return value.map(scrubPhones) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubPhones(v);
    return out as T;
  }
  return value;
}

export const SENTRY_SHARED_OPTIONS = {
  // مفيش tracesSampleRate عمدًا — المطلوب هنا رصد أخطاء بس مش
  // performance monitoring، وتفعيله بيسحب كود تتبّع إضافي في حزمة
  // المتصفح (~٧٠+ كيلوبايت جربناها فعليًا) يتعارض مع طلب المستخدم
  // الصريح إن استهلاك الموقع يفضل خفيف (FND-058).
  sendDefaultPii: false,
  // Session Replay بتتحمّل ضمن الافتراضي في `@sentry/nextjs` حتى من
  // غير أي sample rate متظبط — استبعاد صريح هنا (مش الاعتماد بس على
  // إن معدل العينة صفر) عشان قاعدة الخصوصية الإلزامية فوق تتطبّق فعليًا
  // مش بس نظريًا، وتقليل حجم الـchunk الكسول كمان.
  integrations: <T extends { name: string }>(defaults: T[]): T[] =>
    defaults.filter((i) => i.name !== 'Replay'),
  beforeSend(event: ErrorEvent, _hint: EventHint) {
    return scrubPhones(event);
  },
} as const;
