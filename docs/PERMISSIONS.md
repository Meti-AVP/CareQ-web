# الصلاحيات والأدوار — carq-web

بُني في **المرحلة ٣** من `MISSION.md`. مصفوفة الدور × الأكشن الكاملة، بوابات
الحالة (مش بس الدور)، ومكان كل فحص في الكود.

**قاعدة ذهبية واحدة تحكم الملف ده كله:** **الواجهة مش حدود أمان.** كل فحص
هنا تحسين تجربة (رسالة واضحة بدل خطأ سيرفر خام) + دفاع إضافي (defense in
depth) — الفرض الحقيقي لازم يكون سيرفر-سايد (`require_role` في الباك،
`services/auctions.py::_authorize_bidder` لشروط المزايدة). أي حد يقدر
يتجاوز فحص الواجهة (DevTools، نداء مباشر) لازم الباك اند يرفضه برضه.

---

## ١. الأدوار الموجودة فعليًا

```ts
type UserRole = 'individual' | 'exhibition' | 'admin';
```

**مفيش تمايز صلاحيات داخل نفس الدور حاليًا** — كل أدمن نفس الصلاحيات
(مفيش `super-admin`)، وكل حساب معرض نفس الصلاحيات (مفيش أعضاء فريق
بأدوار مختلفة داخل نفس المعرض — تفصيل في قسم ٥).

| الدور | بيدخل فين | الشرط |
|---|---|---|
| `admin` | لوحة الأدمن (`apps/admin`) بس | `role === 'admin'` هو شرط الدخول الوحيد — أي دور تاني = مفيش داشبورد أصلًا، من غير ما نقول إن فيه واحد (`ADMIN §2`) |
| `exhibition` | بوابة المعارض (`apps/dealers`) بس، بعد `(portal)/*` | `role === 'exhibition'` — غير كده `redirect('/apply')` (`PORTAL §5`) |
| `individual` | مفيش لوحة له | بيقدر بس يقدّم طلب ترقية (`/apply`) في بوابة المعارض — مسار عام |

الفحص ده **مبني بالفعل من المرحلة ٢**: `middleware.ts` (كوكي الجلسة
موجودة) + `(dash|portal)/layout.tsx` (فحص سيرفر-سايد تاني) +
`SessionProvider`/`useSession()` (الدور الفعلي من `GET /v1/me`، وبيمسح
الجلسة لو الدور مش المطلوب للوحة دي — `session-context.tsx`).

---

## ٢. نموذج الصلاحيات المركزي

`packages/api-client/src/permissions.ts` — **ملف واحد**، مُصدَّر من
`@carq/api-client`:

```ts
export type AdminAction =
  | 'exhibition.contract.set'
  | 'exhibition.application.review'
  | 'user.role.set'
  | 'user.status.set'
  | 'auction.mark_defaulted'
  | 'auction.entry.mark_paid'
  | 'listing.flags.set';

export function can(user: Pick<User, 'role'> | null | undefined, action: AdminAction): boolean;
```

كل الأكشنات دي دلوقتي بترجع نفس النتيجة (`user?.role === 'admin'`) —
النموذج موجود مركزيًا **عشان سببين**:

1. **قائمة موحّدة موثّقة** لكل أكشن حساس، بدل ما كل `hook` يفترض ضمنيًا
   إنه محمي لمجرد إنه تحت `/admin/*`.
2. **حارس على مستوى الـhook نفسه** — مش بس على مستوى الوصول للوحة. كل
   الأكشنات السبعة دي (`packages/api-client/src/admin/hooks.ts`) بتنادي
   `requireCan(user, action)` **جوه الـ`mutationFn`** قبل أي نداء شبكة،
   وبترمي `ApiError('FORBIDDEN', ...)` بنفس شكل أي خطأ سيرفر تاني لو
   فشل الفحص. ده دفاع إضافي — لو تمايز أدوار اتضاف جوّه لوحة الأدمن
   نفسها بعدين (زي `admin-readonly`)، نقطة التحقق جاهزة من غير ما
   تتلمس كل صفحة.

**بحثت فعليًا قبل ما أبني — مفيش تكرار:** غير `permissions.ts` نفسه،
مفيش أي ملف/دالة اسمها `can`/`permissions`/`rbac`/`hasPermission` في
المشروع قبل المرحلة دي (بحث شامل بـ`grep`).

---

## ٣. الأكشنات الخطرة — مصفوفة كاملة

كل واحدة فيهم: **تأكيد مزدوج (فتح الـdialog + تأكيد داخله) + سبب مكتوب
إجباري + صف تدقيق** (`ADMIN §10` بند ٥). الأربعة الأولى مذكورة صراحة في
`ADMIN_DASHBOARD_SPEC.md §11` (Definition of Done)، وشارات الثقة مضافة
كخامسة حسب `MISSION.md` (وموثّقة في `ADMIN §4.3` بنص "خانة سبب إجبارية
قبل التفعيل").

| الأكشن | `AdminAction` | الـhook | الـendpoint | الـdialog | `typeToConfirm` |
|---|---|---|---|---|---|
| منح/سحب التعاقد | `exhibition.contract.set` | `useSetContract` | `PATCH /v1/admin/exhibitions/{id}/contract` | `exhibitions/[id]/page.tsx` | **آه عند المنح بس — لازم يكتب «تعاقد»** |
| مراجعة طلب ترقية | `exhibition.application.review` | `useReviewApplication` | `POST /v1/admin/exhibitions/applications/{id}/{action}` | `exhibitions/requests/page.tsx` (٣ dialogs: موافقة/رفض/استكمال) | لأ |
| ترقية/تخفيض دور مستخدم | `user.role.set` | `useSetUserRole` | `PATCH /v1/admin/users/{id}/role` | `users/page.tsx` | **آه — لازم يكتب «ترقية»** |
| إيقاف/إلغاء إيقاف مستخدم | `user.status.set` | `useSetUserStatus` | `PATCH /v1/admin/users/{id}/status` | `users/page.tsx` | لأ |
| تعليم مزاد متعثر | `auction.mark_defaulted` | `useMarkDefaulted` | `POST /v1/admin/auctions/{id}/default` | `auctions/[id]/page.tsx` | **آه — لازم يكتب «متعثر»** |
| تأكيد دفع دخول مزاد | `auction.entry.mark_paid` | `useMarkEntryPaid` | `POST /v1/admin/auction-entries/{id}/paid` | `auctions/[id]/page.tsx` | لأ |
| منح/سحب شارات الثقة | `listing.flags.set` | `useSetListingFlags` | `PATCH /v1/admin/listings/{id}/flags` | `listings/[id]/page.tsx` | لأ |

### تفاوت `typeToConfirm` — اتحسم (`FND-020`)

كان بس ترقية الدور وتعليم مزاد متعثر بيطلبوا كتابة كلمة تأكيد إضافية،
والتعاقد (اللي بيفتح فلوس حقيقية فعليًا) بيكتفي بسبب + تأكيد الـdialog
العادي. **القرار:** منح التعاقد (`isContracted: false → true`) بقى
بيطلب `typeToConfirm="تعاقد"` برضه — نفس مستوى تشدد الترقية والتعثر،
لأنه بيفتح مسار مالي مباشر (المزايدة بفلوس حقيقية). **إيقاف التعاقد
فضل من غير `typeToConfirm`** — عكسي وأقل خطورة من فتح تدفق جديد (سبب +
تأكيد الـdialog كافيين). الإيقاف والشارات فضلوا من غير `typeToConfirm`
عن قصد (أقل خطورة ماليًا من التعاقد/الترقية).

### باجات اتلقطت واتصلحت أثناء بناء النموذج

1. **`useMarkEntryPaid` و`useMarkDefaulted` كانوا بيفقدوا `reason` في
   نداء الـhttp الحقيقي** — الـtype كان بيطلبه، الموك كان بيستخدمه
   ويسجّله في `audit_log`، بس نداء `POST` الحقيقي ماكانش بيبعت `body`
   خالص. يعني السبب المكتوب (متطلب إجباري بحسب `ADMIN §10` بند ٥) مش
   كان هيوصل للسيرفر الحقيقي أبدًا. اتصلّح: الاتنين بقوا بيبعتوا
   `{ reason }` في الـbody.
2. **مفيش `Idempotency-Key` على أي من الأكشنات الخطرة السبعة** —
   نفس نمط `FND-006` من المرحلة ٠ (`idempotencyKey()` موجودة ومُستخدمة
   بكثافة في `dealers/hooks.ts`، لكن غايبة هنا تمامًا). **اتصلّح في
   المرحلة ٥**: `IdempotencyKeyCache` (`client.ts`) اتطبّقت على كل
   الأكشنات العشرة اللي كانت بلا idempotency في `admin/hooks.ts`
   (السبعة الخطرة + `useCollectSellNow`, `useSetListingStatus`,
   `useRevealPhone`) — تفاصيل المفاتيح في `docs/BACKEND-CONTRACT.md §٦.٤`.

---

## ٤. شروط المزايدة الثلاثة (`A-1`)

نفس الدالة (`bidBlockCode` في `permissions.ts`) مستخدمة من اللوحتين —
بدل نسختين منفصلتين بنفس المنطق:

```ts
interface BidConditions {
  role: boolean | null;       // users.role == 'exhibition'
  contracted: boolean;        // exhibitions.is_contracted
  entryPaid: boolean | null;  // auction_entries.paid_at
}

function bidBlockCode(c: BidConditions): 'NOT_AN_EXHIBITION' | 'NOT_CONTRACTED' | 'ENTRY_NOT_PAID' | null
```

**السيرفر بيتحقق منهم بالترتيب ده بالظبط** في
`services/auctions.py::_authorize_bidder` — أول شرط ناقص هو اللي بيحدد
كود الخطأ. `bidBlockCode` بيقلّد نفس الترتيب.

| مين بيستخدمها | لغرض إيه |
|---|---|
| `apps/admin/src/app/(dash)/exhibitions/_lib/conditions.tsx` (`ConditionMarks`) | عرض حالة أهلية كل معرض في جدول `/exhibitions` — ٣ علامات منفصلة + توقّع الكود اللي هيطلع لو زايد دلوقتي |
| `apps/dealers/src/app/(portal)/auctions/[id]/page.tsx` | حساب `canBid` في غرفة المزايدة الحية — **مش نفس الاستدعاء المباشر**، تفصيل تحت |

### قرار متعمّد: مادمجتش `bidBlockCode` جوه حساب `canBid` في `auctions/[id]/page.tsx`

`canBid` في غرفة المزايدة الحية أوسع من الشروط الثلاثة بكتير: فيها كمان
`isOwnListing` (`A-7`)، `ended` (حالة المزاد الحية)، وحالة `blocked` من
استجابة سيرفر فعلية (`handleBidError` بيتعامل مع ٦+ أكواد خطأ مختلفة،
مش بس التلاتة دول). دمج `bidBlockCode` جوه المنطق ده كان محتاج إعادة
هيكلة لمنطق حي حساس (فلوس حقيقية، حالة WS مستقبلية) لفايدة تقليل تكرار
بسيطة (٣ شروط بس من أصل منطق أعقد بكتير). **قرار مقصود: سيبت
`auctions/[id]/page.tsx` زي ما هي** — القيمة الحقيقية للدمج كانت في
توحيد **تعريف** الشروط والرسائل (حصل، `permissions.ts` هو المصدر
الوحيد للتعريف)، مش بالضرورة توحيد **كل** نقطة استخدام.

---

## ٥. بوابات الحالة (مش بس الدور)

بند صريح في `MISSION.md`: "الإخفاء مش كفاية — أي زرار مخفي لازم يكون
الأكشن نفسه محمي كمان". الجدول ده بيوري كل بوابة حالة وفين بالظبط
بتتفحص:

| البوابة | بتتفحص فين | السلوك |
|---|---|---|
| معرض مش متعاقد → مايشوفش/مايدخلش المزادات | `auctions/[id]/page.tsx:186` (`notContracted`)، وبانر مخصص بلينك لـ`/contract` | زرار المزايدة متعطّل + بانر واضح، وخطأ `NOT_CONTRACTED` من السيرفر بيتعامل معاه (`handleBidError`) حتى لو حاول من غير الواجهة |
| رسوم دخول مش مدفوعة | `auctions/[id]/page.tsx:189` (`entryUnpaid`) | بانر + فتح فلو الدفع (`setPayOpen`)، وخطأ `ENTRY_NOT_PAID`/`ENTRY_UNPAID` من السيرفر بيتعامل معاه برضه |
| المزايدة على عربيتك (`A-7`) | `auctions/[id]/page.tsx:181-184` (`isOwnListing`) | الزرار مخفي **و**خطأ `CANNOT_BID_OWN_LISTING`/`SELF_BID` بيتستقبل لو حصل برضه |
| طلب ترقية `pending`/`needs_info`/`rejected` | `apps/dealers/src/app/apply/status/page.tsx` — كل حالة شاشة/Card مستقلة تمامًا (`draft`, `submitted`, `needs_info`, `approved`, `rejected`) | مطابق بالحرف لـ`PORTAL §2.3` — كل الحالات الخمسة متغطية، من غير نقص |
| `/contract` | `apps/dealers/src/app/(portal)/contract/page.tsx` | بطاقة حالة (متعاقد/منتهي/مفيش عقد) + الشروط الثلاثة كصفوف منفصلة (`CheckRow`) + شرح تجاري إن التعاقد قرار أدمن بشري مش self-service |

**كل البوابات دي متحققة إنها مش واجهة بس** — كل واحدة فيها معالجة
لأكواد الخطأ الفعلية القادمة من السيرفر (`handleBidError`)، مش بس فحص
استباقي بيمنع الضغط على الزرار.

---

## ٦. الفريق داخل المعرض (`exhibition_members`) — فيتشر مستقبلي، موثّق بس مش مبني

`PORTAL §6` بيوصف جدول `exhibition_members` (أدوار `owner`/`bidder`/
`viewer`) كـ**"مرحلة ٢" من خطة المنتج نفسها** (تسمية مختلفة عن مراحل
المراجعة دي) — **مش موجود في الباك اند ولا في الكود حاليًا**. اتأكد
بالبحث: مفيش `ExhibitionMember` في `types.ts`، ومفيش أي إشارة في الكود
غير في `docs/`.

**الوضع الحالي:** `exhibitions.user_id` علاقة واحد-لواحد — حساب واحد
بس للمعرض (بيتصرف كـ`owner` ضمنيًا)، وكل موظفي المعرض بيشاركوا نفس
الحساب. ده مقبول للإطلاق حسب المواصفة نفسها.

**متبنيهوش من غير طلب صريح** (زي ما `MISSION.md` بينص) — ده يحتاج جدول
جديد في الباك اند، خارج نطاق الويب أصلًا. لو اتطلب لاحقًا: نموذج
`can()` الحالي جاهز يتوسّع (`AdminAction` بقى `Action` عام يشمل أكشنات
المعارض، وفحص إضافي `exhibitionRole` بدل `user.role` بس).

---

## ٧. جدول: كل دور × كل مسار — مسموح/ممنوع

| الدور | `apps/admin/*` | `apps/dealers/(portal)/*` | `apps/dealers/apply`, `apply/status` | `apps/dealers/login` |
|---|---|---|---|---|
| `admin` | ✅ مسموح | ❌ ممنوع (كوكي مختلفة — `cq_session_admin` مش `cq_session_dealers`، `middleware.ts` بيرجّع `/login`) | ✅ مسموح (مسار عام، مفيش فحص جلسة خالص) | ✅ مسموح لكن `verifyOtp` هترفض (`FORBIDDEN`) لو دوره مش `exhibition` |
| `exhibition` | ❌ ممنوع (نفس المنطق بالعكس) | ✅ مسموح | ✅ مسموح | ✅ مسموح |
| `individual` | ❌ ممنوع | ❌ ممنوع (`role !== 'exhibition'` → `redirect('/apply')`) | ✅ مسموح — ده المسار المخصص له | ✅ مسموح لكن `verifyOtp` هترفض |
| بلا جلسة خالص | → `/login?next=` (`middleware.ts`) | → `/login?next=` | ✅ مسموح | ✅ مسموح |

**مؤكّد بالدليل (e2e):**
- `e2e/admin.spec.ts` + `e2e/dealers.spec.ts` (المرحلة ٢): دخول ناجح،
  دخول مرفوض (رقم مستخدم حقيقي بدور غلط)، وصول مباشر لمسار محمي من
  غير جلسة.
- `e2e/dealers.spec.ts:193`: `/apply` و`/apply/status` متاحين من غير
  جلسة.
- عزل الكوكي بين اللوحتين (`cq_session_admin`/`cq_session_dealers`،
  المرحلة ٢) بيمنع عمليًا إن جلسة أدمن "تسرّب" فتح بوابة المعارض
  والعكس — حتى لو نفس المتصفح ونفس الجهاز.

---

## ٨. الفرض الحقيقي — مسؤولية الباك اند

**الواجهة بتحسّن التجربة، مش بديل عن الفرض.** لازم الباك اند يرفض
سيرفر-سايد، بغض النظر عن أي فحص هنا:

- أي `PATCH`/`POST` تحت `/v1/admin/*` لازم `require_role(ADMIN)` على
  مستوى الراوتر (موثّق كموجود بالفعل في `ADMIN §6.1`).
- `services/auctions.py::_authorize_bidder` هو الحكم النهائي للشروط
  الثلاثة — مش أي حساب في الفرونت.
- `PATCH /v1/exhibitions/me` (تعديل بروفايل المعرض) لازم يرفض تعديل
  `verified`/`is_contracted` حتى لو الحقول دي اتبعتت في الجسم (`PORTAL
  §4.7` — "العَلَمين للعرض فقط، ممنوع أي مفتاح يعدّلهم هنا").
