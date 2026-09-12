/**
 * ════════════════════════════════════════════════════════════════
 * رؤوس الأمان المشتركة — بيستوردها التطبيقين (admin + dealers)
 *
 * ليه الملف ده في الجذر: عشان سياسة الأمان تتعدّل في مكان واحد
 * وتطبّق على البوابتين مع بعض — نسختين بيتفرّقوا في أول hotfix.
 *
 * ملاحظات للباك اند تيم:
 *  · `connect-src` بياخد أصل الـAPI من `NEXT_PUBLIC_API_URL` تلقائي.
 *  · لو صور التخزين (الروابط الموقّعة §F-6) على دومين تاني، حطوه في
 *    `NEXT_PUBLIC_STORAGE_URL` وهيدخل `img-src` لوحده.
 *  · `script-src` فيه `'unsafe-inline'` لأن Next بيحقن سكريبتات
 *    الإقلاع inline. الترقية لنمط الـnonce بتحصل بـmiddleware —
 *    خطوة اختيارية بعد ربط الباك، مش شرط للإطلاق.
 * ════════════════════════════════════════════════════════════════
 */

const isDev = process.env.NODE_ENV !== 'production';

/** أصل خارجي من متغير بيئة — بيرجع '' لو مش متظبط أو مش URL سليم */
function originOf(envValue) {
  if (!envValue) return '';
  try {
    return new URL(envValue).origin;
  } catch {
    return '';
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const storageOrigin = originOf(process.env.NEXT_PUBLIC_STORAGE_URL);

const csp = [
  `default-src 'self'`,
  // dev بس: react-refresh محتاج eval — في الإنتاج بيتشال خالص
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // inline styles لازمة لـnext/font وRecharts
  `style-src 'self' 'unsafe-inline'`,
  // blob: لتنزيل CSV من الجداول · data: للأيقونات المضمّنة
  `img-src 'self' data: blob:${storageOrigin ? ` ${storageOrigin}` : ''}`,
  `font-src 'self'`,
  // ws: في التطوير لـHMR بس
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}${isDev ? ' ws:' : ''}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  // اللوحات دي عمرها ما بتتعرض جوه iframe — قفل clickjacking نهائي
  `frame-ancestors 'none'`,
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // بيمنع المتصفح يخمّن نوع الملف — قفل لهجمات الـMIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // نسخة قديمة من frame-ancestors للمتصفحات الأقدم
  { key: 'X-Frame-Options', value: 'DENY' },
  // الروابط الموقّعة (٥ دقايق) ماينفعش تتسرب في الـReferer لدومينات تانية
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // اللوحات مش محتاجة كاميرا ولا مايك ولا موقع — نقفلهم صراحة
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HSTS بيشتغل فعليًا مع HTTPS بس — وجوده مع HTTP مالوش أثر
  ...(isDev
    ? []
    : [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains',
        },
      ]),
];
