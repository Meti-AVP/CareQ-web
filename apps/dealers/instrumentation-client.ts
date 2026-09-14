/**
 * تحميل كسول لـSentry جانب المتصفح — Next.js (١٥.٣+) بيحمّل الملف ده
 * تلقائيًا من غير أي تعديل في `next.config.mjs`.
 *
 * جرّبنا التحميل المباشر (`Sentry.init` فوري وقت الاستيراد) وقسناه
 * فعليًا: بيضيف ~٧٠-٨٠ كيلوبايت لـ"First Load JS" **لكل صفحة** — نص
 * التحسين اللي اتعمل في FND-058 كان هيتلغي. ده بيتعارض مباشرة مع طلب
 * المستخدم الصريح إن استهلاك الموقع يفضل خفيف جدًا.
 *
 * الحل: `import()` ديناميكي مؤجّل لحد ما المتصفح يفضى (`requestIdleCallback`)
 * — كود الـSDK بيتقسّم chunk منفصل عن الحزمة الحرجة تلقائيًا، فمابيتحسبش
 * في "First Load JS" أصلًا، ولسه بيترصد أي خطأ يحصل بعد أول رندر (الغالبية
 * العظمى من الأخطاء الحقيقية). المقايضة الوحيدة: خطأ يحصل في أول ثانية-اتنين
 * من التحميل (قبل ما الـSDK يخلص تحميل) ممكن ميترصدش — مقايضة معقولة هنا،
 * ومفيش تأثير على رصد أخطاء السيرفر (`sentry.server.config.ts` مش متأثر خالص).
 */
import { SENTRY_SHARED_OPTIONS } from './src/lib/sentry-shared';

function loadSentry() {
  void import('@sentry/nextjs').then(({ init }) => {
    init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...SENTRY_SHARED_OPTIONS });
  });
}

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadSentry, { timeout: 4000 });
  } else {
    setTimeout(loadSentry, 3000);
  }
}
