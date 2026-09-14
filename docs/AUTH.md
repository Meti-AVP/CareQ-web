# طبقة الأوثنتيكيشن — carq-web

بُنيت في **المرحلة ٢** من `MISSION.md`. الملف ده بيوصف الفلو الفعلي في
الكود دلوقتي (وضع الموك) + العقد المطلوب بالحرف من فريق الباك اند
عشان التبديل يحصل من غير أي تغيير في الشاشات (نفس فلسفة `USE_MOCK`).

---

## ١. الفلو الحقيقي (لما `NEXT_PUBLIC_API_URL` يتحط)

```
المستخدم بيكتب رقمه
        │
        ▼
requestOtp(phone)  ──────────►  POST /v1/auth/otp/request  { phone }
        │                                    │
        │                                    ▼ 204
        ▼
المستخدم بيكتب الكود
        │
        ▼
verifyOtp(phone, code, requiredRole)
        │
        ├──────────────►  POST /v1/auth/otp/verify  { phone, code }
        │                            │
        │                            ▼
        │              { access_token, refresh_token, user }
        │
        ├─ لو user.role !== requiredRole:
        │     tokenStore.clear() → throw FORBIDDEN
        │     («الحساب ده مش مصرّح له» — من غير ما نقول إن فيه لوحة أصلًا)
        │
        ├─ establishSession(refresh_token)
        │     └────────►  POST /api/session  { refreshToken }   (وسيط عندنا، مش باك اند)
        │                       └─ بيكتب refresh_token في كوكي httpOnly·Secure·SameSite=Lax
        │
        └─ tokenStore.set(access_token, 900)   ← الذاكرة بس، ١٥ دقيقة

بعد كده أي نداء API:
  http(path) ──► Authorization: Bearer <access_token من الذاكرة>

التجديد الاستباقي (5b) — `SessionProvider` بيراقب كل ٢٠ ثانية:
  tokenStore.isExpiring()  (أقل من دقيقة على الانتهاء؟)
        └─ لو true: refreshSession() بنفس المسار تحت — قبل ما 401 يقع خالص

لو 401 وقع برضو (مثلًا نداء استعجل قبل دورة المراقبة):
  refreshSession() ──────────►  POST /api/session/refresh   (وسيط عندنا)
                                        │
                                        ├─ بيقرا كوكي httpOnly
                                        ├─ POST /v1/auth/refresh { refresh_token }  (الباك اند)
                                        ├─ بيكتب refresh_token الجديد في الكوكي (بيتدوّر — I-4)
                                        └─ بيرجّع { accessToken, expiresIn } للفرونت
                                  ثم إعادة المحاولة مرة واحدة بس.
                                  فشل التجديد ⇒ tokenStore.clear() + حدث
                                  `carq:session-expired` (شاشة «انتهت الجلسة»).
                                  (قفل single-flight واحد — استباقي وتفاعلي بيشاركوا نفس الطلب)

خروج:
  endSession() ──► tokenStore.clear() + POST /api/session/logout (بيمسح الكوكي)
```

### الملفات

| الملف | المسؤولية |
|---|---|
| `packages/api-client/src/client.ts` | `tokenStore` (الذاكرة)، `http()` (مهلة + إلغاء + قفل تجديد single-flight)، `DEMO_MODE` |
| `packages/api-client/src/auth.ts` | `requestOtp` / `verifyOtp` / `endSession` — منطق الفلو، مشترك بين اللوحتين |
| `packages/api-client/src/session-context.tsx` | `SessionProvider` / `useSession()` — حالة الجلسة على مستوى React |
| `packages/api-client/src/server/session.ts` | `createSessionHandlers(cookieName)` — مصنع الـhandlers، مستورد من `@carq/api-client/server` |
| `apps/{admin,dealers}/src/lib/session.ts` | بيربط المصنع باسم كوكي التطبيق ده (`cq_session_admin` / `cq_session_dealers`) — نقطة التفرقة الوحيدة بين التطبيقين |
| `apps/{admin,dealers}/src/app/api/session/*` | أغلفة رفيعة حوالين `lib/session.ts` — Route Handlers فعلية |
| `apps/{admin,dealers}/src/middleware.ts` | حارس المسارات — فحص وجود كوكي الجلسة (باسمها بتاع التطبيق ده) |
| `apps/{admin,dealers}/src/app/(dash\|portal)/layout.tsx` | نفس الفحص سيرفر-سايد (دفاع مزدوج مع الميدلوير) + `SessionProvider` **هنا بس** (مش عالمي — راجع الباج تحت) |
| `apps/{admin,dealers}/src/components/Shell.tsx` | استهلاك `useSession()`: شاشة تحميل/انتهاء جلسة، اسم المستخدم الحقيقي، زرار خروج، بانر الوضع التجريبي |

### باج اتصلّح أثناء المرحلة — `/apply` كانت بتترحّل لـ`/login`

**ده أخطر باج اتلقط في المرحلة دي — كان معطّل فيتشر أساسي بالكامل.**
`/apply` و`/apply/status` مسار عام مقصود صراحة (`PORTAL §2`): الطريقة
الوحيدة لفرد عادي يقدّم كطلب معرض. `middleware.ts` كان مستثنيهم صح
(`PUBLIC_PATHS`)، لكن `SessionProvider` (اللي فيه effect بينادي
`router.replace('/login')` لو `status === 'unauthenticated'`) كان
متحط في `Providers.tsx` العام — يعني بيغلف **التطبيق كله** بما فيه
المسارات العامة، مش بس المسارات المحمية.

النتيجة: أي زائر يفتح `/apply` من غير جلسة (الحالة الطبيعية الوحيدة
لصفحة زي دي) كان بيشوف `POST /api/session/refresh` يرجع ٤٠١ (مفيش
كوكي أصلًا)، وبعدها تحويل فوري لـ`/login` — يعني **مفيش حد كان يقدر
يقدّم كطلب معرض جديد خالص.**

اتلقط بالدليل: فتح `/apply` بمتصفح حقيقي من غير أي كوكي، مع تسجيل
الشبكة — `page.url()` بعد التحميل كان `http://localhost:3200/login`
مش `/apply`.

**الإصلاح:** `SessionProvider` اتنقل من `Providers.tsx` العام إلى
جوّه `(dash)/layout.tsx` و`(portal)/layout.tsx` بس (حوالين `<Shell>`)
— المسارات المحمية فعليًا، مش التطبيق كله. `/login` و`/apply/*` بره
الـgroups دي أصلًا فمابقوش متأثرين. مؤكّد بإعادة فتح `/apply` فعليًا
(فضلت زي ما هي) وبـ`e2e/dealers.spec.ts:193`
(`apply و apply/status متاحين من غير جلسة`).

### باج اتصلّح أثناء المرحلة — تلوّث الكوكي بين اللوحتين

أول نسخة من الكوكي كانت باسم واحد ثابت (`cq_session`) للتطبيقين. كوكيز
المتصفح بتتحدد بالـ**host** بس مش بالـ**port** — يعني `localhost:3100`
(أدمن) و`localhost:3200` (معارض) بيتشاركوا نفس الـhost محليًا، فكوكي
مكتوبة من تطبيق كانت بتتقرا في التاني. دخولك كأدمن كان بيخلي بوابة
المعارض تفتقر إنك داخل (كوكي موجودة) وتحاول تجدّد منها، رغم إنها مش
كوكي معرض أصلًا.

اتلقط بالدليل: `e2e/global-setup.ts` بيسجّل دخول أدمن ثم يفتح
`/login` بتاع المعارض في نفس المتصفح — بدل ما يشوف فورم الدخول، كان
بيترمي لـ`/` (الميدلوير شايف كوكي "صالحة"). في وضع الموك ده كان بيتغطّى
بالصدفة (أي كوكي = هوية ديمو ثابتة)، بس مع باك اند حقيقي ده كان
هيبقى خلط جلسات فعلي بين اللوحتين على نفس الجهاز.

**الإصلاح:** اسم كوكي مختلف لكل تطبيق (`cq_session_admin` /
`cq_session_dealers`) عن طريق `createSessionHandlers(cookieName)` في
`server/session.ts` + `apps/{admin,dealers}/src/lib/session.ts`. في
الإنتاج المشكلة مش موجودة أصلًا (دومينات مختلفة تمامًا)، بس تسمية
الكوكي مختلفة أسلم وبتخلي الفصل مش معتمد على فصل الدومين بس.

---

## ٢. وضع الموك (`USE_MOCK` — مفيش `NEXT_PUBLIC_API_URL`)

مفيش باك اند نتحقق منه، فـ`requestOtp`/`verifyOtp` بترجع هوية ديمو ثابتة
حسب `requiredRole` اللي كل تطبيق بيطلبه (`packages/api-client/src/mock/db.ts::getMockIdentity`):

* لوحة الأدمن (`requiredRole="admin"`) → `ADMIN_USER` (`u-admin`).
* بوابة المعارض (`requiredRole="exhibition"`) → صاحب `DEMO_EXHIBITION_ID` (`ex-1`).

كوكي الجلسة (`cq_session_admin` / `cq_session_dealers` — اسم مختلف
لكل تطبيق، التفصيل في القسم الجاي) بتتكتب فعليًا حتى في وضع الموك (عن
طريق `/api/session` و`/api/session/refresh`) — يعني `middleware.ts`
ودورة التجديد الصامت شغّالين بالحرف زي وضع الإنتاج، الفرق الوحيد إن
التوكن والمستخدم مش حقيقيين.

**استثناء متعمّد لاختبار «دخول مرفوض»:** لو الرقم اللي اتكتب فعليًا
رقم مستخدم حقيقي موجود في بيانات الموك (`getMockIdentity` في
`mock/db.ts`)، بترجع هويته الحقيقية بدل الهوية الافتراضية — فلو
الدور مختلف عن `requiredRole` اللوحة بترفض بنفس منطق الباك اند
الحقيقي (`FORBIDDEN`). مثال: رقم `ADMIN_USER` (`01001234553`) في
بوابة المعارض، أو رقم صاحب المعرض التجريبي (`01246830664`) في لوحة
الأدمن. ده بيسمح باختبار السيناريو ده e2e فعليًا من غير باك اند
حقيقي (`e2e/admin.spec.ts` و`e2e/dealers.spec.ts`)، من غير ما يتغيّر
سلوك الديمو الافتراضي («أي رقم مصري صحيح بيعدّي») لأي رقم تاني.

### `DEMO_MODE` — بوابة الدخول الوهمي

```ts
export const DEMO_MODE = USE_MOCK && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
```

* **مش افتراضي صامت داخل وضع الموك نفسه** — فيه متغيّر بيئة صريح
  (`NEXT_PUBLIC_DEMO_MODE`) يقدر يقفل قبول أي رقم/كود حتى لو `USE_MOCK`
  شغّال (مفيد لبيئة موك مشتركة ملهاش داعي تكون مفتوحة للجميع).
  الافتراضي (لو المتغيّر مش متحط خالص) هو **مفعّل** طول ما مفيش
  `NEXT_PUBLIC_API_URL` — عشان التجربة المحلية تفضل «شغّالة من الصندوق»
  زي ما كانت.
* بيتقفل تلقائيًا أول ما `NEXT_PUBLIC_API_URL` يتحط (لأن `USE_MOCK`
  بيبقى `false`، والشرط `DEMO_MODE = USE_MOCK && ...` بيبقى `false` معاه).
* تحذير واضح بيطبع في الكونسول (`console.warn`) وفي الواجهة (بانر
  «وضع تجريبي» أعلى كل شاشة داخل `Shell`، ونص في صفحتي الدخول).

> **قرار محتاج تأكيدك:** الاسم `NEXT_PUBLIC_DEMO_MODE` والسلوك
> الافتراضي (مفعّل طول ما مفيش API_URL، إلا لو اتحط `false` صراحة)
> مقترح مني — سجّلته كسؤال في `reports/PHASE-2-AUTH.md §9`.

---

## ٣. عقد الباك اند المطلوب (توصيل، مش اختراع)

الـendpoints دي **موجودة وشغّالة بالفعل** حسب `PORTAL §8.1`:

```http
POST /v1/auth/otp/request   { phone }                      → 204
POST /v1/auth/otp/verify    { phone, code }                → { access_token, refresh_token, user }
GET  /v1/me                                                 → { id, name, phone, role, ... }
```

### endpoint واحد جديد مطلوب هنا — `POST /v1/auth/refresh`

مش موثّق صراحة في المواصفتين، لكن لازم يكون موجود عشان `I-4` (تدوير
الـrefresh token) يشتغل من غير ما الفرونت يعرف تفاصيل الباك اند:

```http
POST /v1/auth/refresh   { refresh_token }
→ { access_token, expires_in, refresh_token }   (refresh_token جديد — بيتدوّر)
→ 401 لو الـrefresh_token لسه صالح بس منتهي/متلغي
```

`apps/*/src/app/api/session/refresh/route.ts` (عن طريق
`packages/api-client/src/server/session.ts::handleRefreshSession`) بينده
على الـendpoint ده لما `NEXT_PUBLIC_API_URL` يبقى متحط، وبيرجّع
`{accessToken, expiresIn}` للفرونت، وبيكتب الـrefresh token الجديد في
الكوكي httpOnly.

### الأدوار (`role`) وقفل اللوحات

* لوحة الأدمن: `user.role !== 'admin'` ⇒ الفرونت بيرفض الدخول من غير
  ما يقول إن فيه داشبورد (`verifyOtp` بترمي `FORBIDDEN`).
* بوابة المعارض: نفس المنطق بس `requiredRole = 'exhibition'`.
* **ده حماية واجهة بس.** الفرض الحقيقي لازم يكون سيرفر-سايد
  (`require_role` في الباك) — أي endpoint إداري لازم يرفض `403` لغير
  الأدمن حتى لو التوكن صالح، وأي endpoint معرض لازم يرفض غير
  `exhibition`. الواجهة بتحسّن التجربة، مش بديل عن الفرض ده.

---

## ٤. CORS — متطلب للباك اند

`http()` بيبعت `credentials: 'same-origin'` (مش `'include'`) لنداءات
الباك اند الحقيقي. **السبب:** الأوثنتيكيشن مع الباك اند بالكامل عن طريق
`Authorization: Bearer <token>` — كوكي الجلسة موجودة بس بين
الفرونت (`admin.carq.eg`/`dealers.carq.eg`) وroute handler بتاعنا
(`/api/session/*`) نفس الأصل، وعمرها ما بتوصل لدومين الباك اند
(`api.carq.eg`) أصلًا.

**النتيجة العملية:** الباك اند **مش محتاج** `Access-Control-Allow-Credentials`
ولا `Access-Control-Allow-Origin` معلّم بأصل معيّن عشان الكوكيز —
الطلبات مالهاش كوكيز خالص. لسه محتاج CORS عادي (`Access-Control-Allow-Origin`
لأصول `admin.carq.eg`/`dealers.carq.eg`، `Access-Control-Allow-Methods`،
`Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key`)
عشان المتصفح يسمح بالنداء الـcross-origin أصلًا.

---

## ٥. `X-Request-Id` — مش مبني في المرحلة دي

`MISSION.md §5.5d` بيطلب معرّف طلب لكل نداء (correlation ID) — ده **مؤجّل
للمرحلة ٥** (جاهزية الربط بالباك اند) عن قصد، مش نسيان. سجّلته في
`reports/PHASE-2-AUTH.md`.

---

## ٦. حدود معروفة (موثّقة، مش مخفية)

1. **`usePendingCount`/`useHealth` (وباقي الـ٦٥ hook) بتشتغل بغض النظر
   عن حالة الجلسة** — مفيش `enabled: status === 'authenticated'` على
   مستوى الـhooks نفسها. في وضع الموك ده مالوش أثر (الموك مابيتحققش من
   التوكن أصلًا). لما الباك اند يتوصّل، أي query بتتفعّل قبل ما التجديد
   الصامت يخلص هتاخد `401` وتتعامل معاه `http()` (تجديد + إعادة محاولة)
   — يعني مش كسر، بس فيه نداء زيادة ممكن يتجنّب. إصلاحه محتاج تعديل
   توقيع الـ٦٥ hook (`enabled` param) — خارج نطاق المرحلة دي عن قصد،
   واتسجّل كملاحظة.
2. **إلغاء الطلب عند فك تركيب المكوّن (بند 6b في المهمة) مبني جزئيًا.**
   `http()` بيقبل ويدمج `signal` لو المنادي بعته، لكن الـ٦٥ hook
   الحالية (`admin/hooks.ts` و`dealers/hooks.ts`) **مش بتبعت** `context.signal`
   بتاعة TanStack Query لـ`http()`. المهلة الزمنية (`timeoutMs`) شغّالة
   ومضمونة بغض النظر عن ده — طلب معلّق هيتلغي لوحده. تفعيل الإلغاء عند
   فك التركيب تحديدًا محتاج تمشيط ميكانيكي على الملفين (٦٥ موقع) —
   مقترح يتعمل مع تصحيح باج idempotency في المرحلة ٥ لأنه بيلمس نفس
   الملفين بالظبط.
3. **الرابط بين تجديد التوكن وWebSocket (`R-4`) مش مبني هنا.**
   `refreshSession()` بتحدّث `tokenStore` بس — إرسال
   `{type:'auth', token: newAccessToken}` على سوكت شغّال اتبنى في
   المرحلة ٦ (`useRealtime`).

---

## ٧. الدخول بجوجل — خيار إضافي جنب OTP

طلب صريح: زرار "الدخول بحساب Google" في صفحة `/login` في اللوحتين،
**جنب** كود OTP مش بدل منه. الفلو **Authorization Code** كامل من غير
أي مكتبة/SDK خارجي (`packages/api-client/src/server/google-oauth.ts`):

```
المستخدم بيدوس «الدخول بحساب Google» (<a href="/api/auth/google">)
        │
        ▼
GET /api/auth/google  (route handler)
        ├─ بيولّد state عشوائي (CSRF)، يحطه في كوكي قصيرة العمر (٥ دقايق)
        └─ redirect → accounts.google.com/o/oauth2/v2/auth?...
                              │
                    المستخدم بيوافق في جوجل
                              │
                              ▼
GET /api/auth/google/callback?code=...&state=...
        ├─ يتأكد إن state مطابق للكوكي (رفض لو مختلف/غايب)
        ├─ POST oauth2.googleapis.com/token  (client_secret — سيرفر بس)
        │        └─ access_token
        ├─ GET openidconnect.googleapis.com/v1/userinfo
        │        └─ { email, email_verified, name, sub }
        │
        ├─ وضع الموك (مفيش NEXT_PUBLIC_API_URL):
        │     أي حساب جوجل بيعدّي (نفس فلسفة OTP الديمو بالحرف) —
        │     بيكتب كوكي جلسة ديمو ويحوّل لـ/
        │
        └─ باك اند حقيقي:
              POST /v1/auth/google { email, googleId, name }  (endpoint جديد)
                     └─ { access_token, refresh_token, user }
              نفس فحص الدور بتاع verifyOtp بالحرف (role !== requiredRole ⇒ رفض)
              نجح ⇒ نفس كوكي الجلسة اللي OTP بيكتبه بالظبط
```

**النقطة المهمة معماريًا:** بعد ما الكوكي يتكتب، **مفيش أي كود إضافي
لازم يشتغل** — نفس `SessionProvider` (تجديد صامت عند التحميل يقرا
الكوكي ويملى `tokenStore`) ونفس `middleware.ts` شغّالين زي ما هم بالظبط.
جوجل وOTP بيوصلوا لنفس نقطة النهاية (كوكي الجلسة)، فكل حاجة بعد كده
مشتركة ١٠٠٪.

### الإعداد المطلوب

`GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` (سيرفر بس، مفيش
`NEXT_PUBLIC_` — التفاصيل وخطوات الإنشاء في `.env.example`). من غيرهم
الزرار بيرجّع لصفحة الدخول برسالة واضحة (`?error=google_not_configured`)
بدل ما يفشل بصمت.

### أسئلة مفتوحة لفريق الباك

1. **`POST /v1/auth/google` لسه مش موجود** — عقده المطلوب موثّق في
   `docs/BACKEND-CONTRACT.md §1`. من غيره، الدخول بجوجل هيفضل شغّال في
   وضع الديمو بس (زي OTP بالظبط) لحد ما الباك يبنيه.
2. **حساب جوجل جديد (إيميل مش متسجّل قبل كده) — يتعامل إزاي؟** نفس
   سؤال "التسجيل التلقائي" مطروح لـOTP أصلًا — قرار عمل (auto-register
   كـ`individual`؟ رفض؟) لازم الباك يحدده، مش الفرونت.
