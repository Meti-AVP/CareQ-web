# مراجعة الأمان — carq-web

بُنيت في **المرحلة ٤** من `MISSION.md`. قائمة الضوابط × الحالة × الدليل،
لكل بند من `ADMIN §10` و`PORTAL §10` و`security-headers.mjs`.

---

## ١. صور البطاقة وأوراق المعارض (F-6 — قانون ١٥١/٢٠٢٠)

| الضابط | الحالة | الدليل |
|---|---|---|
| مفيش مفتاح تخزين في `<img src>` مباشر | ✅ سليم | `grep` شامل لكل `<img src={...}>` في التطبيقين — صفر نتائج بتحط مفتاح مباشر |
| المسار الوحيد رابط موقّع ٥ دقايق | ✅ سليم | `useSignedIdImage` (`admin/hooks.ts`) هي المسار الوحيد، مستخدمة في `financing/[id]/page.tsx` |
| منع الكاش | ✅ سليم فعليًا (بتوضيح) | الـhook دي `useMutation` مش `useQuery` — مفيش `queryKey` يتخزّن تحته النتيجة أصلًا. الحماية الفعلية في الصفحة: الرابط عايش في `state` مؤقت وبيتمسح عند القفل/انتهاء العداد. **صححت تعليق قديم** كان بيدّعي `gcTime: 0` غير موجود فعليًا (وأصلًا مش خيار صالح لـ`useMutation`) |
| منع right-click / drag | ✅ سليم | `onContextMenu={(e) => e.preventDefault()}` و`draggable={false}` على الصورة (`financing/[id]/page.tsx:471-472`) |
| منع `download` attribute | ✅ سليم | صفر استخدام لـ`download` على أي `<img>` بصورة بطاقة |
| منع التنزيل عبر الطباعة | **كانت ناقصة — اتصلّحت (`FND-024`)** | مفيش `@media print` في المشروع كله (`grep` صفر نتائج) — أي dialog مفتوح (بما فيه صورة بطاقة) كان بيتطبع عادي. أضفت قاعدة عامة في `packages/ui/src/styles.css` تخفي أي `[role="dialog"]` وقت الطباعة. مؤكّد بـe2e (`security.spec.ts` — طباعة الصفحة بتخفي الـdialog) |
| بانر "بيانات شخصية — كل فتحة متسجّلة" | ✅ سليم | موجود في الديالوج، ونص صريح "ممنوع التنزيل أو التصوير أو المشاركة" |
| أوراق طلبات ترقية المعارض (سجل تجاري/ضريبي) | ⚠️ **مش شغّالة — قرار مقصود وآمن** | `exhibitions/requests/page.tsx` بتوضح صراحة إن `GET /v1/admin/exhibitions/applications/{id}/document` **ناقص في الباك**، وبدل ما تبني رابط عام بإيدها (يكسر F-6) بتعرض "الرابط الموقّع لسه مش متاح" + مفتاح التخزين كنص. **قرار صح**، بس الميزة نفسها (مراجعة الأوراق بصريًا) مش شغالة. موثّق كطلب للباك في قسم ٧ |

## ٢. إخفاء أرقام التليفونات

| الضابط | الحالة | الدليل |
|---|---|---|
| إخفاء افتراضي في الجداول | ✅ سليم | `maskPhone()` (`packages/ui/src/lib/format.ts:68-72`) مستخدمة في `users/page.tsx`, `exhibitions/[id]`, `exhibitions/requests`, `listings/[id]`, `sell-now` |
| **إخفاء افتراضي في بوابة المعارض** | **كانت مكسورة — اتصلّحت (`FND-021`)** | `apps/dealers/src/app/(portal)/leads/page.tsx` كانت بتعرض `formatPhone(t.withPhone)` (الرقم **كامل**) بدل `maskPhone` — في عمود الجدول (سطر 154) وفي subtitle تفاصيل المحادثة (سطر 427). ده مخالفة مباشرة للقاعدة، وغير متسق تمامًا مع `useRevealPhone` (الموجودة في admin بس، مش في dealers خالص). **اتصلّح الاتنين لـ`maskPhone`** |
| الكشف بضغطة واعية + تسجيل | ✅ سليم (في admin) | `useRevealPhone` (`admin/hooks.ts`) — `POST /v1/admin/users/{id}/phone`، بتسجّل `user.phone_revealed` في التدقيق. **ناقصة في dealers خالص** — لا يوجد مسار كشف واعٍ لتليفون مستفسر؛ الحل المتخذ هو الإخفاء الدائم (مفيش endpoint حقيقي لكشف رقم مستفسر بالمعارض في المواصفة أصلًا) |
| **تصدير CSV — أخطر نقطة محتملة** | ✅ سليم | `DataTable.tsx`'s `rawValue()` بتستخدم `col.value(row)` (نفس المستخدمة للفرز) مش الحقل الخام تلقائيًا. كل عمود تليفون اتفحص (`users`, `exhibitions/requests`) بيعرّف `value: (row) => maskPhone(row.phone)` صراحة. عمود `leads` "المستفسر" بيصدّر `withName` بس (مفيش عمود منفصل لتليفون في هذا الجدول) — آمن حتى قبل الإصلاح |
| **تحذير بنيوي (مش باج حاليًا)** | ⚠️ يستحق قرار مستقبلي | الحماية معتمدة كليًا على انضباط كل صفحة تعرّف `value: maskPhone(...)`. لو عمود جديد اتضاف من غير `value` مخصص، `rawValue` هترجع `row[col.key]` الخام تلقائيًا ويتصدّر كامل من غير ما ينكسر أي type-check أو static-check. **مفيش فحص آلي يمنع ده حاليًا** |

## ٣. CSP — تقييم ترقية `script-src` لنمط الـnonce

**القرار: لا — موثّق ليه بالتفصيل، مش تنفيذ ناقص.**

`script-src` فيها `'unsafe-inline'` عشان Next.js بيحقن سكريبتات bootstrap
inline. قيّمت الترقية لنمط nonce (المطلوبة صراحة في `MISSION.md`):

- توثيق Next.js الرسمي لنمط الـnonce يشترط **dynamic rendering** لكل
  صفحة بتستخدمه — الـnonce لازم يتغيّر كل response، وده يتعارض جوهريًا
  مع الـstatic prerendering.
- **معظم المسارات في التطبيقين أصلًا `ƒ Dynamic`** (تأكدت من مخرجات
  `next build`) — نظريًا ممكن يستفيدوا من nonce من غير مشكلة.
- **بس `/login`, `/apply`, `/apply/status`** (أهم المسارات العامة —
  أول حاجة أي زائر جديد بيشوفها) هي `○ Static` حاليًا. تفعيل nonce
  عليهم يعني إجبارهم يبقوا dynamic — **فقدان الـstatic optimization
  لأهم صفحات الدخول في المنتج**، أو بناء نظام هجين (headers مختلفة
  per-route في `next.config.js`) معقّد ومخاطرته عالية على استقرار
  الإنتاج.
- التنفيذ الكامل محتاج: تعديل `middleware.ts` (توليد nonce)، تمرير
  الـnonce عبر request headers لـroot layout، وتغطية كل `<script>`
  (بما فيها سكريبتات Next الداخلية والمكتبات الخارجية زي Recharts) —
  نطاق واسع لفائدة أمنية هامشية بما إن باقي دفاعات XSS قوية بالفعل
  (صفر `dangerouslySetInnerHTML`، مفروضة آليًا بـ`static-checks.mjs`
  في خط `npm run verify`).

**القرار: نسيب `unsafe-inline` زي ما هي دلوقتي.** التوصية تبقى مفتوحة
لو حصل حادث XSS فعلي يبرر المخاطرة، أو لو فريق منتج قرر التضحية بالـ
static optimization لـ`/login`/`/apply` مقابل الترقية.

## ٤. باقي الهيدرز

اتفحصت فعليًا على **بناء إنتاجي حقيقي** (`next build` + `next start`،
مش `next dev`) — مش افتراض من قراءة الكود بس:

```
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...; upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

`X-Powered-By` **مش ظاهر** (سليم — مفيش تسريب هوية السيرفر). نفس
الهيدرز موجودة حتى على ردود الـ`307 redirect` من `middleware.ts` (اتأكد
بفتح `/users` من غير جلسة).

> **تصحيح لاحق (المرحلة ٥):** الفحص هنا اتأكد من **وجود** الهيدر بس،
> مش من أثره على تصفّح فعلي متعدد الصفحات. لما اختبارات e2e اتحوّلت
> تشتغل على `next build`+`next start` محليًا (بلا TLS حقيقي)، `HSTS`
> و`upgrade-insecure-requests` سبّبوا `ERR_SSL_PROTOCOL_ERROR` فعلي —
> المتصفح بيحاول يرقّي أي طلب تالٍ لنفس الأصل لـHTTPS (بما فيها
> الـprefetch الداخلي بتاع Next)، وبيفشل لأنه مفيش TLS. **الافتراض
> «HSTS مالهوش أثر مع HTTP» كان غلط.** الإصلاح: الهيدرين دول بقوا
> مشروطين بـ`isHttpsDeployment` (`security-headers.mjs`) — إشارة حقيقية
> إن HTTPS متفروض فعلًا (`VERCEL=1` تلقائي على Vercel، أو
> `FORCE_HTTPS_HEADERS=true` لاستضافة تانية وراها TLS) — مش مجرد
> `NODE_ENV=production`. **على Vercel (النشر الموصى بيه) السلوك متغيّرش
> خالص** — بيوصلوا زي ما هما. التفاصيل الكاملة في
> `reports/PHASE-5-BACKEND-READINESS.md`.

## ٥. XSS

| الضابط | الحالة | الدليل |
|---|---|---|
| صفر `dangerouslySetInnerHTML` | ✅ سليم ومفروض آليًا | `grep` شامل: صفر استخدام في الكود الفعلي. `scripts/static-checks.mjs` بيفشل `npm run verify` لو حد استخدمها |
| نصوص حرة من المستخدم (سبب رفض، اسم معرض، ملاحظات) | ✅ سليم | كل عرض اتفحص بـJSX عادي (`{app.reviewNote}` إلخ) — React بيعاملها كنص تلقائيًا، مفيش حقن HTML يدوي في أي مكان |

## ٦. CSRF

| الضابط | الحالة | الدليل |
|---|---|---|
| `SameSite=Lax` على كوكي الجلسة | ✅ سليم | `server/session.ts::cookieOptions()` |
| **فحص `Origin` على route handlers** | **كان ناقص — اتصلّح (`FND-025`)** | `grep` شامل لـ`Origin`/`Referer` في `apps/` رجّع صفر نتائج قبل الإصلاح. `SameSite=Lax` دفاع قوي لكنه مش كامل ١٠٠٪ (بعض سيناريوهات cross-site navigation لسه بتاخد الكوكي). أضفت `isTrustedOrigin()` في `server/session.ts` — بترفض أي طلب لـ`/api/session/*` لو هيدر `Origin` موجود ومختلف عن أصل الطلب نفسه (`403 FORBIDDEN`). مؤكّد بـe2e إن الرفض شغال (`security.spec.ts`) وإن فلو الدخول/التجديد/الخروج الطبيعي لسه شغال (`auth.spec.ts` — ٨/٨ ناجحين بعد الإصلاح) |

## ٧. صف التدقيق لكل mutation

جدول كامل — كل `useMutation` كتابة في `admin/hooks.ts` وهل بتعمل
`invalidateQueries(['admin','audit'])` بعد النجاح:

| Hook | قبل | بعد |
|---|---|---|
| `useSetListingFlags`, `useSetListingStatus`, `useSetContract`, `useReviewApplication`, `useMarkEntryPaid`, `useMarkDefaulted`, `useSignedIdImage`, `useSetUserRole`, `useSetUserStatus` | ✅ | ✅ (بدون تغيير) |
| `useOfferSellNow` | ❌ | **✅ اتصلّح** |
| `useCollectSellNow` | ❌ | **✅ اتصلّح** |
| `useSetFinancingStatus` | ❌ (رغم إن الواجهة بتوعد المستخدم نصًا "بيتسجّل في سجل التدقيق") | **✅ اتصلّح** |
| `useRevealPhone` | ❌ (مفيهاش `useQueryClient` أصلًا) | **✅ اتصلّح** |

**مهم:** القصور ده كان في **تحديث كاش الواجهة** بس — منطق الموك
(`mock/db.ts`) كان بيسجّل `audit(...)` فعليًا في كل الحالات دي من
الأساس، فمفيش صف تدقيق كان ضايع. المشكلة كانت إن شاشة `/audit` مش
هتعكس الصف الجديد لايف لو مفتوحة في تبويب تاني وقت الأكشن.

**ملاحظة إضافية:** `useAudit` نفسها مفيهاش `refetchInterval` — مش باج
مؤكّد (سجل التدقيق مش وقت-حرج زي طابور بيع حالًا)، بس يستحق قرار صريح
هل يتحط بولينج أم يُعتمد على الـinvalidation بس.

## ٨. مفيش حذف

| الضابط | الحالة | الدليل |
|---|---|---|
| صفر hard delete في الموك | ✅ سليم | `grep` شامل لـ`delete`/`splice` في `mock/db.ts` — كل النتائج `filter` لعرض/إحصاء، مش حذف بيانات |
| `useDeleteListing` (`dealers/hooks.ts`) | ✅ سليم في وضع الموك، ⚠️ **غير مؤكّد في الوضع الحقيقي** | في وضع الموك: `l.status = 'removed'` صراحة (soft delete مؤكّد). في وضع الباك الحقيقي: نداء HTTP `DELETE /v1/listings/{id}` — **السلوك الفعلي (soft أو hard) بيتحدد بالباك اند نفسه، مش الفرونت**. التعليق يفترض soft، لكن ده افتراض مش دليل قاطع من كود الفرونت. موثّق كطلب تأكيد للباك في قسم ٧ |
| `idImagesDeletedAt` عند رفض طلب تمويل | **كان ناقص — اتصلّح (`FND-023`)** | الواجهة (`financing/[id]/page.tsx:107`) بتوعد صراحة "بعد القفل صور البطاقة بتتمسح من التخزين"، لكن `mock/db.ts::setFinancingStatus` ماكانتش بتحدد `idImagesDeletedAt` عند الرفض خالص — القيمة الوحيدة الظاهرة كانت مصدرها الصدفة العشوائية في بيانات الـseed مش فعل الرفض الحقيقي. اتصلّح: الرفض بيحدد `idImagesDeletedAt` فعليًا دلوقتي |

## ٩. تسريب في اللوجز

| الضابط | الحالة | الدليل |
|---|---|---|
| صفر `console.log` في المشروع | ✅ سليم بالكامل | `grep` شامل على الأربع حزم (`apps/admin`, `apps/dealers`, `packages/api-client`, `packages/ui`) — صفر نتائج |

## ١٠. التبعيات (`npm audit`)

**مطابق تمامًا لخط الأساس** (المرحلة ٠) — ٧ ثغرات (٤ متوسطة، ٢ عالية،
١ حرجة)، كلها في `devDependencies` غير مباشرة (`esbuild`/`vite`/
`vite-node` عبر `vitest`، `postcss` عبر نسخة `next` الداخلية). مفيش
تغيير عن الأساس ومفيش تبعية إنتاج شغّالة في المتصفح متأثرة. **لم يُنفّذ
`npm audit fix --force`** — بيرقّي `next` لـ`16.3.5` و`vitest` لـ`4.1.11`
(breaking changes)، قرار محتاج موافقة صريحة (`MISSION.md §3.5.3`).

## ١١. البناء الإنتاجي

| الضابط | الحالة | الدليل |
|---|---|---|
| مفيش source maps متاحة | ✅ سليم | `productionBrowserSourceMaps` مش مفعّلة صراحة في `next.config.js` (الافتراضي `false`). أُكّد فعليًا: `find apps/{admin,dealers}/.next/static -name "*.map"` بعد بناء إنتاجي حقيقي — صفر ملفات |
| مفيش أسرار تحت `NEXT_PUBLIC_` | ✅ سليم | ٣ متغيرات بس في كل المشروع: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STORAGE_URL`, `NEXT_PUBLIC_DEMO_MODE` — كلهم عناوين/فلاجات عامة. مفيش ملف `.env*` في الريبو أصلًا |

---

## ملخص الإصلاحات (بالدليل، `reports/FINDINGS.md` فيه التفاصيل الكاملة)

| ID | الوصف | الخطورة |
|---|---|---|
| FND-021 | تليفون المستفسر كامل غير مخفي في `/leads` (بوابة المعارض) | P1 |
| FND-022 | ٤ mutations (`useOfferSellNow`, `useCollectSellNow`, `useSetFinancingStatus`, `useRevealPhone`) مبتعملش invalidate لكاش التدقيق | P2 |
| FND-023 | `setFinancingStatus` مش بتحدد `idImagesDeletedAt` عند الرفض رغم وعد الواجهة | P2 |
| FND-024 | مفيش `@media print` — صور بطاقة/dialogs حساسة كانت بتتطبع عادي | P2 |
| FND-025 | مفيش فحص `Origin` في route handlers الجلسة (دفاع CSRF طبقة واحدة بس) | P2 |
| FND-026 | تعليق وهمي `gcTime: 0` على `useSignedIdImage` (خيار مش صالح لـ`useMutation` أصلًا) | P3 |
| FND-027 | أوراق طلبات ترقية المعارض مش قابلة للعرض — endpoint ناقص (قرار آمن مقصود) | P2 (توثيق للباك) |
| FND-028 | `useDeleteListing` (`DELETE` HTTP) — soft/hard غير مؤكّد من الفرونت في الوضع الحقيقي | P3 (توثيق للباك) |
