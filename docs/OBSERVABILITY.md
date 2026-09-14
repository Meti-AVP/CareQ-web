# الرصد والملاحظة (Observability) — المرحلة ٨

## الوضع قبل كده

صفر أداة تتبّع أخطاء في الإنتاج. لو شاشة وقعت عند معرض أو أدمن حقيقي،
محدش كان هيعرف — الدليل الوحيد كان شكوى المستخدم نفسه.

## الحل: Sentry

اتفق عليه صراحة مع المستخدم (موصى بيه أصلًا في `MISSION.md` §8 بند ٥).
مضاف في التطبيقين (`@sentry/nextjs`) بأقل إعداد ممكن — بلا `Session
Replay`، بلا `withSentryConfig` (رفع الـsource maps محتاج
`SENTRY_AUTH_TOKEN`/org/project مش متاحين لسه؛ الرصد نفسه شغّال بالكامل
من غيرهم).

### الملفات (نفس الشكل في `apps/admin` و`apps/dealers`)

| الملف | الغرض |
|---|---|
| `instrumentation-client.ts` | تهيئة Sentry جانب المتصفح — Next.js ١٥.٣+ بيحمّلها تلقائيًا من غير أي تعديل في `next.config.mjs` |
| `sentry.server.config.ts` | تهيئة جانب السيرفر (Node runtime) |
| `sentry.edge.config.ts` | تهيئة الـmiddleware/edge runtime |
| `instrumentation.ts` | بيحمّل الاتنين فوق حسب `NEXT_RUNTIME`، وبيصدّر `onRequestError` (بيرصد أخطاء route handlers/server components تلقائيًا) |
| `src/lib/sentry-shared.ts` | إعدادات مشتركة + `beforeSend` (سكرَبة أرقام التليفونات المصرية لو ظهرت بالغلط) |
| `src/lib/report-error.ts` | نقطة واحدة لأي كود بينده على `Sentry.captureException` يدويًا (مستخدمة في `error.tsx`) |

### التفعيل

بلا `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (`.env.example`): الـSDK
بيتحمّل عادي بس مبيبعتش أي حدث — نفس مبدأ المرونة المستخدم مع جوجل أوث
(`docs/AUTH.md §7`). التفعيل الفعلي محتاج:

1. حساب Sentry (فيه خطة مجانية) ومشروع Next.js فيه.
2. نسخ الـDSN من Settings → Projects → (مشروعك) → Client Keys.
3. حطه في `.env.local` (كل تطبيق على حدة) في المتغيّرين الاتنين —
   نفس القيمة بالظبط.

### قاعدة الخصوصية (إلزامية من `MISSION.md`)

**ممنوع نبعت أرقام تليفونات ولا صور بطاقات ولا توكنز في تقرير الخطأ.**

- `sendDefaultPii: false` صراحة (الافتراضي، بس معلن هنا للتوثيق) — مفيش
  IP ولا كوكيز بتتبعت مع أي حدث.
- رسائل الأخطاء في المشروع كلها نصوص عربية عامة (`ApiError.message`،
  `packages/api-client/src/errors.ts`) — مفيهاش بيانات شخصية مضمّنة
  في التصميم الأصلي أصلًا.
- `beforeSend` في `sentry-shared.ts` خط دفاع إضافي (defense in depth):
  بيدوّر على أي نص شكله رقم تليفون مصري (`01[0125]\d{8}`) في أي حقل
  نصي جوه الحدث كله ويستبدله بـ`[رقم محجوب]` قبل الإرسال.
- مفيش `Session Replay` مفعّل — ده أكبر مصدر تسريب بيانات شخصية شائع
  في أدوات الرصد (بيسجّل الشاشة فعليًا)، ومامفيش داعي ليه هنا.

### أخطاء الرندر (`error.tsx`)

كل route group محمي (`(dash)` في الأدمن، `(portal)` في المعارض) عنده
`error.tsx` بينادي `reportError()` في `useEffect` أول ما يظهر — تفاصيل
في `reports/PHASE-8-QUALITY.md`.
