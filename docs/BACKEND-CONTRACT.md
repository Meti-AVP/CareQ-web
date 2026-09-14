# عقد الباك اند — carq-web

مستند واحد يتسلّم لفريق الباك اند. بيجمع كل حاجة الفرونت محتاجها ومش موجودة
(أو موجودة بشكل ناقص) — مبني على المواصفتين (`docs/ADMIN_DASHBOARD_SPEC.md §6`
و`docs/EXHIBITION_PORTAL_SPEC.md §8`) + كل الملاحظات اللي اتلقطت في مراجعة
المراحل ٠-٥ (`reports/FINDINGS.md`) + اختبار حي فعلي لسيرفر موك بسيط
(`scripts/mock-backend.mjs`، تفاصيله في `reports/PHASE-5-BACKEND-READINESS.md §١`).

**كل عقد هنا مقترح من الفرونت.** لو الباك غيّر فيه، الملف ده والمواصفتين
بيتحدّثوا معاه — مش العكس. لو الباك بنى بشكل مختلف، حدّث `types.ts` وده كفاية،
مفيش شاشة المفروض تتغيّر (`packages/api-client/src/client.ts` هو نقطة التبديل).

---

## ٠. إزاي تستخدم المستند ده

1. **قسم ١** — التوثيق الكامل لطبقة الأوثنتيكيشن (المرحلة ٢) + الـendpoint
   الوحيد الجديد اللي الفرونت محتاجه (`POST /v1/auth/refresh`).
2. **قسم ٢** — الموجود فعلًا (٨ + الأوثنتيكيشن + endpoints بوابة المعارض)
   — مرجع سريع، مش تكرار للمواصفات.
3. **قسم ٣** — كل endpoint ناقص، مجمّع ومرتّب حسب الشاشة، بمثال حقيقي من
   بيانات الموك.
4. **قسم ٤** — تعديلات على endpoints موجودة (N+1، pagination، حقول ناقصة).
5. **قسم ٥** — تغييرات الداتابيز.
6. **قسم ٦** — عقد الأخطاء، الـheaders المطلوبة (CORS، X-Request-Id، Idempotency)،
   ومصفوفة idempotency كاملة لكل mutation في الفرونت.
7. **قسم ٧** — أسئلة قرار تجاري/فني محتاجة إجابة صريحة قبل البناء.
8. **قسم ٨** — نتيجة اختبار حي فعلي للتبديل (`USE_MOCK=false`) — دليل، مش ادعاء.

---

## ١. الأوثنتيكيشن — موجود، والفرونت بيستهلكه بالشكل ده

الفلو الكامل (المرحلة ٢، مبني وشغّال في الفرونت) موثّق بالتفصيل في
`docs/AUTH.md`. ملخّص العقد المُستهلَك:

```http
POST /v1/auth/otp/request   { phone }                      → 204
POST /v1/auth/otp/verify    { phone, code }                → { access_token, refresh_token, user }
GET  /v1/me                                                 → { id, name, phone, role, ... }
```

### endpoint جديد مطلوب — `POST /v1/auth/refresh`

مش موثّق صراحة في أي من المواصفتين، لكن لازم يكون موجود عشان تدوير
الـrefresh token (`I-4`) يشتغل:

```http
POST /v1/auth/refresh   { refresh_token }
→ 200 { access_token, expires_in, refresh_token }   (refresh_token جديد — بيتدوّر مع كل استخدام)
→ 401 لو الـrefresh_token منتهي أو متلغي
```

بينادى من `apps/{admin,dealers}/src/app/api/session/refresh/route.ts`
(عن طريق `packages/api-client/src/server/session.ts`) — الفرونت بيبعت الكوكي
الخاصة بيه بس، مش عن طريق `/v1/auth/refresh` مباشرة من المتصفح.

### endpoint جديد مطلوب — `POST /v1/auth/google` (طلب صريح، دخول بجوجل)

نفس شكل رد `verifyOtp` بالحرف — الفرونت بيتعامل معاه بنفس المنطق
تمامًا (فحص الدور، رفض `FORBIDDEN` من غير تفاصيل لو الدور غلط):

```http
POST /v1/auth/google   { email, googleId, name }
→ 200 { access_token, refresh_token, user }
→ 403 لو الدور بعد الإنشاء/القراءة مش المطلوب للوحة (نفس X-2)
```

`googleId` = حقل `sub` من `id_token`/`userinfo` بتاع جوجل — معرّف
جوجل الداخلي الثابت للحساب، أدق من الإيميل (الإيميل ممكن يتغيّر).
**سؤال عمل مفتوح:** حساب جوجل بإيميل جديد كليًا (مش متسجّل قبل كده)
— يتعامل إزاي؟ نفس سؤال "التسجيل التلقائي" المطروح أصلًا لـOTP، قرار
الباك مش الفرونت. تفاصيل الفلو الكامل في `docs/AUTH.md §7`.

### الأدوار — الفرض الحقيقي لازم يكون سيرفر-سايد

الفرونت بيتحقق من `user.role === 'admin'` (أو `'exhibition'`) بعد
`verifyOtp` ويرفض الدخول محليًا لو مختلف — **ده تحسين تجربة بس**. لازم
كل endpoint إداري (`/v1/admin/*`) يرفض `403 FORBIDDEN` لغير `admin` حتى
لو التوكن صالح، وكل endpoint بتاع المعارض (`/v1/auctions/*/bids` مثلًا)
يرفض غير `exhibition` — الدور بيتقرا من الداتابيز مع كل request، مش
بيتكاش (`I-4`).

---

## ٢. الموجود فعلًا — مرجع سريع

### لوحة الأدمن (٨ endpoints، `require_role(ADMIN)`)
`GET /admin/sell-now/requests` · `POST .../offer` · `POST .../collected` ·
`PATCH /admin/listings/{id}/flags` · `PATCH /admin/exhibitions/{id}/contract` ·
`POST /admin/auction-entries/{id}/paid` · `POST /admin/auctions/{id}/default` ·
`GET /admin/audit`

### بوابة المعارض
`POST/GET /v1/auth/*` · `GET/PATCH /v1/me` · `GET /v1/me/listings` ·
`POST/PATCH/DELETE /v1/listings…` · `POST /v1/listings/{id}/photos` ·
`POST .../sold` · `.../reactivate` · `.../renew` ·
`GET /v1/exhibitions` · `/{id}` · `/{id}/listings` ·
`GET /v1/auctions` · `/{id}` · `/{id}/bids` · `POST .../entry` · `POST .../bids` ·
`GET/POST /v1/chats…` · `GET /v1/catalog/makes` · `/governorates` · `/filters` ·
`WS /v1/ws` (مواضيع `chat:{id}` · `auction:{id}` · `user:{id}` — تفاصيل
البروتوكول في `PORTAL §4.5`. **الفرونت بقى بيستهلكه فعليًا من المرحلة ٦**
(`auction:{id}` بس — تفاصيل كاملة وجدول الأحداث في `docs/REALTIME.md`))

---

## ٣. الناقص — لازم يتبني

### أ) إحصائيات الأدمن (كل تشارتس `/` و`/sell-now` و`/auctions` و`/financing` و`/health` متوقفة عليها)

```http
GET /v1/admin/stats/overview?days=&from=&to=&governorate=&make=
→ {
    "listings":  { "active": 0, "draft": 0, "sold": 0, "reserved": 0,
                   "expired": 0, "removed": 0, "rejected": 0 },
    "users":     { "total": 0, "new": 0, "individual": 0, "exhibition": 0, "admin": 0 },
    "sellNow":   { "pending": 0, "offered": 0, "accepted": 0, "collected": 0 },
    "auctions":  { "live": 0, "settled": 0, "failed": 0, "overdue": 0 },
    "financing": { "submitted": 0, "contacted": 0, "approved": 0, "rejected": 0 },
    "trust":     { "kmVerifiedPct": 0, "inspectedPct": 0, "withPhotosPct": 0, "pricedPct": 0 },
    "previous":  { /* نفس الشكل للفترة السابقة — للدلتا */ }
  }

GET /v1/admin/stats/timeseries?metric=<m>&days=&from=&to=&governorate=&make=
   metric ∈ listings_published | users_created | sell_now_requests | auction_bids |
            chat_messages | financing_applications | scan_jobs |
            financing_by_type | auctions_created
→ { "points": [{ "t": "2026-09-01", "series": { "active": 12, "draft": 3 } }] }

GET /v1/admin/stats/breakdown?dimension=<d>&days=&from=&to=&governorate=&make=
   dimension ∈ make | governorate | price_tag | listing_status | body | transmission |
               price_bucket | term_months | down_tier | auction_status |
               bids_by_exhibition | financing_monthly | sellnow_value
→ { "buckets": [{ "key": "تويوتا", "count": 42, "value": 18400000 }] }

GET /v1/admin/stats/funnel?name=publish|sell_now|financing&days=&from=&to=
→ { "steps": [{ "key": "draft", "label": "مسودة", "count": 120 }] }

GET /v1/admin/stats/admin-activity
→ { "cells": [{ "day": 0, "hour": 14, "count": 3 }] }   ← بتوقيت Africa/Cairo (C-52)
```

**قواعد ثابتة على الردود دي (مفروضة بالفعل في الفرونت):**
- كل التجميع بالتاريخ **بتوقيت `Africa/Cairo`** (`X-2`) — مصر بتطبّق التوقيت
  الصيفي من ٢٠٢٣، فالإزاحة مش ثابتة على طول السنة.
- الأيام الفاضية بترجع بـ`0`، **مش محذوفة** — غير كده الخط بيكدب.
- الفلوس أعداد صحيحة على السلك (`X-1`) — مفيش كسور جنيه.

**قسم النشاط والثقة (`C-40`..`C-45`) مؤجّل عمدًا** — الكتالوج بيعرّفهم لكن
مفيش شاشة تستضيفهم في خريطة المسارات الحالية (`FND-009`/`FND-033`، قرار
منتج موثّق). متبنوش endpoints لهم دلوقتي.

### ب) الجداول والأكشنات الناقصة (لوحة الأدمن)

```http
GET   /v1/admin/listings?status=&make=&governorate=&q=&has_photos=&priced=&cursor=
PATCH /v1/admin/listings/{id}/status      { status: 'rejected'|'removed', reason }
GET   /v1/admin/users?role=&status=&q=&cursor=
PATCH /v1/admin/users/{id}/role           { role, reason }
PATCH /v1/admin/users/{id}/status         { status: 'suspended'|'active', reason }
POST  /v1/admin/users/{id}/phone          → { phone }   ← كشف رقم، بيتسجّل (§10.2)
GET   /v1/admin/exhibitions?contracted=&verified=&cursor=
POST  /v1/admin/exhibitions               { user_id, name, area, governorate, ... }
PATCH /v1/admin/exhibitions/{id}          { name?, area?, verified?, ... }
GET   /v1/admin/exhibitions/{id}/bids     → AuctionBid[]   ← بديل الـN+1 الحالي (FND-007)
GET   /v1/admin/exhibitions/applications?status=&cursor=
GET   /v1/admin/exhibitions/applications/{id}
POST  /v1/admin/exhibitions/applications/{id}/approve       { reason }
POST  /v1/admin/exhibitions/applications/{id}/reject        { reason }
POST  /v1/admin/exhibitions/applications/{id}/request-info  { reason, fields[] }
GET   /v1/admin/exhibitions/applications/{id}/document?kind=commercial_register
      → { url, expiresAt }                              ← موقّع ٥ دقايق + مسجّل (FND-027)
GET   /v1/admin/auctions?status=&cursor=
GET   /v1/admin/auction-entries?paid=false&cursor=
GET   /v1/admin/financing/applications?status=&cursor=
PATCH /v1/admin/financing/applications/{id}  { status, reason }
GET   /v1/admin/financing/applications/{id}/id-image?side=front|back
      → { url, expiresAt }                               ← موقّع ٥ دقايق + مسجّل
GET   /v1/admin/scan-jobs?status=&cursor=
GET   /v1/admin/health   → { workerAlive, queuedScans, oldestQueuedScanSeconds,
                              failedScans24h, overdueAuctions, expiredSellNowOffers,
                              expiredActiveListings, unpricedActivePct, idempotencyKeys, checkedAt }
GET   /v1/admin/sell-now/requests/{id}    ← صفحة التفاصيل محتاجاه، ناقص حاليًا
```

**ملاحظة على `GET /v1/admin/auction-entries` — pagination بسيطة مش كافية
(`FND-044`):** الفرونت بيستخدم الـendpoint ده بدون `auctionId` (كل الصفوف
عبر المنصة) في ٣ أماكن: جدول «رسوم غير مدفوعة» في `/auctions`، وحساب
حالة دفع كل معرض في `/exhibitions` و`/exhibitions/[id]`. الاستخدامين
الأخيرين محتاجين **التجميع عبر كل المعارض** (مين دافع ومين لأ)، مش صفحة
واحدة من الصفوف — يعني مجرد إضافة `?cursor=` زي باقي الجداول (المذكورة
في `ADMIN §6.2`) هتكسرهم. **الأصح على الأرجح** endpoint تجميعي منفصل
(مثلاً `GET /v1/admin/exhibitions/{id}/unpaid-entries-count` أو حقل
`unpaidEntriesCount` جاهز في رد `GET /v1/admin/exhibitions`) بدل ما
الفرونت يجيب كل صف بنفسه ويجمّعه. **قرار تصميم مطلوب منكم.**

**ملاحظة على `GET /v1/admin/auctions/{id}` و`.../bids`:** الفرونت **مش**
محتاج نسخة أدمن منفصلة — بيستخدم `GET /v1/auctions/{id}` و`/{id}/bids`
العامّين (موجودين بالفعل، `PORTAL §8.1`) لشاشة تفاصيل المزاد في لوحة
الأدمن. ده قرار مقصود، مش سهو (`FND-008`، اتحل بمراجعة `ADMIN §6.1/§6.2`
كاملين: مفيش نسخة أدمن لتفاصيل مزاد واحد معرّفة أصلًا، ومتّسق مع `A-12`
— اسم المزايد علني داخل المزاد بالتصميم). **لو الباك عايز يفرض صلاحيات
مختلفة على تفاصيل المزاد للأدمن، لازم يقول كده صراحة** وهنبني نسخة منفصلة.

### ج) التسجيل والترقية لمعرض (بوابة المعارض — كله جديد)

```http
POST  /v1/exhibitions/applications          { name, ownerName, phone, governorate, area,
                                               address, commercialRegister, taxId,
                                               inspectionService, financingNote }
POST  /v1/exhibitions/applications/{id}/documents   multipart، يتنده لكل ورقة على حدة
GET   /v1/exhibitions/applications/me       → حالة طلبي
PATCH /v1/exhibitions/applications/me       → إعادة إرسال بعد needs_info

PATCH /v1/exhibitions/me      { name?, area?, governorate?, financingNote?, inspectionService? }
POST  /v1/exhibitions/me/logo · /cover      multipart

GET   /v1/auctions/mine?role=bidder|winner&cursor=
GET   /v1/auctions/{id}/entry/me
GET   /v1/me/exhibition/stats?from=&to=     → لازم يرجّع `sold_at` لكل بيعة (D-06 sparkline)

GET   /v1/me/exhibition/entries?paid=&cursor=
POST  /v1/auctions/{id}/entry/receipt       multipart — إيصال تحويل رسوم الدخول

POST  /v1/listings/bulk                     مصفوفة + Idempotency-Key مستقل لكل صف (اختياري —
                                             الفرونت حاليًا بيعمل ٥ نداءات POST /v1/listings
                                             متوازية بحد أقصى، شغّال بدونه)
```

### د) المحادثات — الرد من البوابة (موجود جزئيًا، اتأكد إنه بالشكل ده)

```http
GET  /v1/chats/{id}/messages  → { items: [{ id, threadId, from: 'exhibition'|'buyer', body, at }] }
POST /v1/chats/{id}/messages  { body }  + Idempotency-Key
POST /v1/chats/{id}/read
```

---

## ٤. تعديلات على endpoints موجودة

| # | المشكلة | المطلوب |
|---|---|---|
| ١ | `GET /admin/sell-now/requests` بيرجّع `listingId`/`sellerId` UUIDs بس | **ضمّن ملخص الإعلان والبائع** (عنوان، سعر، صورة، اسم، تليفون) في الرد — غير كده N+1 على ٢٠٠ صف |
| ٢ | نفس الـendpoint `limit 200` من غير pagination/فلترة | `?status=&cursor=` بنفس `Page[T]` |
| ٣ | `GET /admin/audit` `limit 200` من غير تاريخ ولا فلترة فاعل | `?from=&to=&actor_id=&cursor=` — الفلترة دي دلوقتي بحث نصي في الصفحة المعروضة بس (`FND-037`)، مش على السجل كله |
| ٤ | `GET /v1/auctions` بيرجّع `listingId` UUID بس | **ضمّن ملخص الإعلان** (`title`, `image`, `year`, `km`, `governorate`, `price`) — غير كده N+1 |
| ٥ | `AuctionOut` مفيهوش `sellerId` | محتاج لتطبيق `A-7` (اخفي زرار المزايدة على عربيتك) |
| ٦ | `AuctionOut` مفيهوش حالة دخول المزايد | `myEntry: { id, paid: bool } | null` — غير كده نداء لكل صف |
| ٧ | `GET /v1/auctions` بيرجّع `status='live'` بس | `?status=` عشان `/auctions/mine` تعرض المنتهية |
| ٨ | `PATCH /v1/me` بياخد `name`,`area` بس | حقول المعرض محتاجة `PATCH /v1/exhibitions/me` منفصل (موجود في قسم ٣ج) |
| ٩ | `auction_entries.fee` دايمًا `0` | سياسة رسوم — **قرار تجاري مطلوب**، راجع قسم ٧ |
| ١٠ | `GET /v1/me/exhibition/stats` من غير `sold_at` | D-06 (متوسط أيام حتى البيع) دلوقتي بلاطة من غير اتجاه زمني |

---

## ٥. تغييرات الداتابيز المطلوبة

| التغيير | ليه |
|---|---|
| **`search_queries`** (جدول جديد: `query`, `normalized`, `user_id?`, `results_count`, `created_at`) | `C-45` دلوقتي بيقرا من `saved_searches` بس — من غير الجدول ده مفيش «أكتر بحث بيرجع صفر نتايج» (**مؤجّل مع باقي C-40..C-45**، مش أولوية) |
| **`listings.rejection_reason`** (`String(200)`, nullable) | `rejected` موجودة في الـenum ومفيش مكان للسبب |
| **`users.suspended_reason`** + `suspended_at` | نفس السبب للإيقاف |
| **`financing_applications.reviewed_by`/`reviewed_at`** | مين غيّر حالة الطلب |
| **فهرس على `audit_log.created_at`** | التايملاين بيرتّب بيه ومفيش فهرس |
| **فهرس على `scan_jobs.status`** | لوحة الصحة بتفلتر بيه كل ٣٠ ثانية |
| **`financing_applications.id_images_deleted_at`** | `F-6` بيطلب حذف الصور بعد قفل الطلب — الفرونت (وضع الموك) بيحطها فعليًا عند الرفض، محتاجة عمود حقيقي في الباك |
| **جدول `exhibition_applications`** (كامل — أعمدة في `PORTAL §8.4`) | طلبات الترقية لمعرض بالكامل |
| **أعمدة جديدة على `exhibitions`**: `phone`, `address`, `commercial_register`, `tax_id`, `logo_url`, `contract_starts_at`/`contract_ends_at`, `application_id` | تفاصيل في `PORTAL §8.4` — `contract_starts_at`/`contract_ends_at` **مش تحسين شكلي**: `is_contracted` بوليان لوحده بيخلي انتهاء عقد = حد لازم يفتكر يقفله يدوي |
| **جدول `exhibition_members`** (مرحلة ٢ مستقبلية) | فريق المعرض — مش مطلوب للإطلاق، موثّق فقط |
| **جدول `payments`** (لما بوابة دفع حقيقية تتقرر) | تفاصيل في `PORTAL §8.4` |

---

## ٦. العقود المشتركة (مفروضة بالفعل في الفرونت — الباك لازم يطابقها)

### ٦٫٠ فحص الملكية (authorization بالـid) — **إلزامي، P0** (`FND-052`)

اختبار حي (`e2e/idor.spec.ts`، المرحلة ٧) كان أثبت: معرض داخل بجلسة
صحيحة بيقدر يشوف بيانات إعلان معرض تاني كاملة بمجرد ما يغيّر `id` في
الـURL — `GET /v1/listings/{id}` كانت بترجع أي إعلان موجود من غير ما
تتأكد إن `seller.id` بيطابق المعرض المصادَق عليه.

**اتصلّح في وضعي الموك الاتنين** (`mock/db.ts::getOwnedListing`،
`mock-backend.mjs::findOwnedListing` — كلاهما بيرجّعوا `403 FORBIDDEN`
دلوقتي لأي طلب مش من صاحب الإعلان، مؤكّد باختبار حي + اختبار عقد آلي).
**السطرين دول مرجع تنفيذي بس — الباك الحقيقي لازم يطبّق نفس الفحص
سيرفر-سايد بنفسه من الصفر**، مش يعتمد على إن الفرونت/الموك بيعمله:

**المطلوب إلزاميًا من الباك:** كل endpoint بياخد `id` مورد خاص بمستأجر
معيّن لازم يتأكد من الملكية قبل ما يرجّع/يعدّل أي حاجة، وإلا يرجّع `403`
(نفس شكل `X-4`، كود `FORBIDDEN`) — **مش بيانات جزئية ومش شاشة بيضا**:

| Endpoint | فحص الملكية المطلوب |
|---|---|
| `GET/PATCH/DELETE /v1/listings/{id}` | `listing.seller_id == exhibition المصادَق عليه` |
| `POST /v1/listings/{id}/photos`، `/sold`، `/reactivate`، `/renew` | نفس الشيء |
| `GET /v1/chats/{id}/messages`، `POST .../messages`، `.../read` | المستخدم المصادَق عليه لازم يكون طرف في المحادثة دي |

**مش محتاج فحص ملكية** (بالتصميم، بيانات سوق علنية): `GET /v1/auctions/{id}`،
`/bids`، `GET /v1/exhibitions/{id}` — دول متاحين لكل المعارض المتعاقدة
عمدًا (`A-12`، `PORTAL §4.5`). أما مسارات الأدمن (`/v1/admin/*`) فمفروض
يشوفها كل الموارد بحكم الدور — مش IDOR، ده تصميم صحيح.

**ملاحظة إضافية (`FND-053`، أولوية أقل بكتير):** الـids في بيانات الموك
متسلسلة رقميًا (`l-1`..`l-190`) وسهلة التخمين — تحسين إضافي مرغوب فيه
(UUIDs عشوائية) لكن **مش بديل** عن فحص الملكية فوق؛ من غيره حتى id عشوائي
مش هيمنع المشكلة الأساسية.

### ٦٫١ عقد الأخطاء (`X-4`)

```json
{ "error": { "code": "NOT_CONTRACTED", "message": "معرضك مش متعاقد مع CarQ", "fields": null } }
```

الرسالة بالعربي وجاهزة للعرض زي ما هي — الفرونت بيعرض `error.message` مباشرة
ومابيخترعش نص. الأكواد الثابتة: `NOT_AUTHENTICATED` `FORBIDDEN` `NOT_FOUND`
`VALIDATION_ERROR` `CONFLICT` `RATE_LIMITED` — بالإضافة لأكواد الدومين
(`LISTING_NOT_FOUND`, `AUCTION_NOT_SETTLED`, `ENTRY_NOT_PAID`, `NOT_AN_EXHIBITION`,
`NOT_CONTRACTED`, `CANNOT_BID_OWN_LISTING`, `AUCTION_NOT_LIVE`, `AUCTION_ENDED`,
`BID_TOO_LOW`, `BID_NOT_ON_STEP`). أسماء بديلة بيفهمها الفرونت كمرادف:
`ENTRY_UNPAID`≡`ENTRY_NOT_PAID`، `SELF_BID`≡`CANNOT_BID_OWN_LISTING`،
`AUCTION_CLOSED`≡`AUCTION_ENDED`. لو الباك هيستخدم أكواد تانية، ضيفوها في
`packages/api-client/src/types.ts::ErrorCode`.

### ٦٫٢ CORS

`http()` (`packages/api-client/src/client.ts`) بيبعت `credentials: 'same-origin'`
لنداءات الباك اند — **مش `'include'`**. السبب: الأوثنتيكيشن مع الباك بالكامل
عن طريق `Authorization: Bearer <token>`، مش كوكيز (الكوكي `cq_session_*` بين
الفرونت وroute handler بتاعه بس، same-origin، عمرها ما توصل لدومين الباك).

**النتيجة العملية:** الباك **مش محتاج** `Access-Control-Allow-Credentials`
ولا يقيّد `Access-Control-Allow-Origin` لأصل معيّن عشان الكوكيز (مفيش كوكيز
بترسل خالص). لسه محتاج CORS عادي:
- `Access-Control-Allow-Origin`: أصول `admin.carq.eg` و`dealers.carq.eg` (إنتاج)، `localhost:3100`/`3200` (تطوير)
- `Access-Control-Allow-Methods`: `GET,POST,PATCH,DELETE,OPTIONS`
- `Access-Control-Allow-Headers`: **لازم تشمل** `Content-Type, Authorization, Idempotency-Key, X-Request-Id` — تجربة حية (قسم ٨) لقطت إن نسيان `X-Request-Id` من القايمة دي بيوقف كل نداء بـCORS error صامت في الكونسول من غير أي إشارة تانية

### ٦٫٣ `X-Request-Id` (`MISSION.md §5.5d`)

كل نداء من الفرونت بيبعت `X-Request-Id` (UUID مولّد محليًا). **مطلوب من
الباك:**
1. يسجّله في اللوج مع كل request (عشان لو معرض اشتكى من طلب فشل، تقدروا
   تلاقوه فورًا).
2. لو عنده معرّف طلب داخلي خاص بيه، يرجّعه في رد الخطأ كـheader
   `X-Request-Id` — الفرونت بيفضّله على المولّد محليًا لو موجود
   (`client.ts` بيقرا `res.headers.get('x-request-id')`).
3. الرقم ده بيتعرض للمستخدم النهائي في رسالة الخطأ («رقم المرجع: …») —
   جزء من `errorMessage()` في `packages/api-client/src/errors.ts`.

### ٦٫٤ Idempotency (`X-3`) — مصفوفة كاملة (بعد إصلاح المرحلة ٥)

كل الـmutations دي دلوقتي بتبعت `Idempotency-Key` **ثابت طول ما نفس
العملية المنطقية معلّقة** (`IdempotencyKeyCache`، `client.ts`) — الباك
لازم يرفض تكرار نفس المفتاح خلال نافذة معقولة (٢٤ ساعة مقترحة) بإرجاع
نفس النتيجة الأولى بدل تنفيذ العملية تاني.

| Mutation | التطبيق | مفتاح التمييز |
|---|---|---|
| `useOfferSellNow` | أدمن | `id:price` |
| `useCollectSellNow` | أدمن | `id` |
| `useSetListingFlags` | أدمن | `id:kmVerified:inspected` |
| `useSetListingStatus` | أدمن | `id:status` |
| `useSetContract` | أدمن | `id:isContracted` |
| `useReviewApplication` | أدمن | `id:action` |
| `useMarkEntryPaid` | أدمن | `entryId` |
| `useMarkDefaulted` | أدمن | `id` |
| `useSetFinancingStatus` | أدمن | `id:status` |
| `useSetUserRole` | أدمن | `id:role` |
| `useSetUserStatus` | أدمن | `id:status` |
| `useRevealPhone` | أدمن | `userId` |
| `useCreateListing` | معارض | معرّف مؤقت (عملية واحدة لحد النجاح) |
| `usePlaceBid` | معارض | `auctionId:amount` (مبلغ مختلف = عملية جديدة عن قصد) |
| `useCreateEntry` | معارض | `auctionId` |
| `useMarkListingSold` | معارض | `id` |
| `useReactivateListing` | معارض | `id` |
| `useRenewListing` | معارض | `id` |
| `useUploadListingPhoto` | معارض | `id` |
| `useSendLeadMessage` | معارض | `threadId` |
| `useBulkCreate` (رفع بالجملة) | معارض | `bulk-{uploadId}-{rowIndex}` — مستقل لكل صف من التصميم |

مالوش idempotency (مقصود — نداءات قراءة أو رابط موقّع مؤقت مش mutation):
`useSignedIdImage` (`GET`، بيرجّع رابط مؤقت بس).

---

## ٧. أسئلة قرار تجاري/فني — محتاجة إجابة قبل البناء

1. **رسوم دخول المزاد (`auction_entries.fee`) — مبلغ ثابت لكل مزاد، ولا
   نسبة من `start_price`، ولا اشتراك شهري؟** دلوقتي `0` دايمًا في كل
   مكان (لوحة الأدمن وبوابة المعارض). (`ADMIN §6.3` بند ٥، `PORTAL §8.3` بند ٦)
2. **بوابة دفع حقيقية (Paymob/Fawry)** — مش متركّبة في أي مكان. التحصيل
   الحالي بالكامل يدوي (تحويل بنكي/انستاباي + رفع إيصال + تأكيد أدمن
   بإيده). الفرونت مبني بحيث إضافة بوابة لاحقًا = استبدال خطوة واحدة
   (`PayEntryButton.tsx`) — بس القرار نفسه (أنهي بوابة؟ إمتى؟) لسه مفتوح.
3. **`useDeleteListing` — الحذف الحقيقي في الباك soft ولا hard؟**
   (`FND-028`) الفرونت مبني على افتراض soft delete (`X-6`: مفيش حذف)،
   وفي وضع الموك مؤكّد (`status='removed'`)، لكن نداء الباك الحقيقي
   `DELETE /v1/listings/{id}` — السلوك الفعلي بيتحدد بالباك اند نفسه.
   **محتاجين تأكيد صريح.**
4. **الكتالوج الناقص من كتالوج التشارتس (`C-40`..`C-45`)** — قسم «النشاط
   والثقة» بالكامل (رسايل/يوم، محادثات جديدة، إشعارات بالنوع، تغطية
   الثقة، تغطية التسعير، أشهر البحثات) موجود في المواصفة بلا شاشة
   تستضيفه. **قرار المراجعة: يتأجّل عمدًا، يفضل موثّق في الكتالوج** —
   مش مطلوب رد من الباك دلوقتي، بس علّموا إنه مش نسيان لو سألتوا.
5. **رمز مرجع الخطأ من الباك (`X-Request-Id`)** — هل عندكم معرّف طلب
   داخلي جاهز يترجع في هيدر الرد؟ لو لأ، الفرونت هيفضل يستخدم المولّد
   محليًا بس مش هيتربط بلوج الباك مباشرة.
6. **شكل حدث رسالة المحادثة على `chat:{thread_id}`** (المرحلة ٦) —
   الموضوع نفسه موجود (`R-1`) لكن شكل حمولة الحدث مش موصوف في أي
   مواصفة وصلتنا (خلاف `auction:{id}` اللي `PORTAL §4.5` بتوصفه بالحرف).
   الفرونت دلوقتي بيتعامل مع أي حدث على الموضوع ده كـ"اسحب تاني"
   (إبطال كاش) بدل قراءة حمولته — تفاصيل `docs/REALTIME.md §2/§4`.
   **محتاجين شكل الحدث بالحرف** (زي `message.created`؟) عشان نحوّلها
   لتحديث كاش مباشر من غير نداء REST إضافي.
7. **موضوع `admin` جديد** (`ADMIN §9` المرحلة ٢) — `sell_now.requested`
   · `auction.settled` · `scan.failed`. لسه polling (`docs/REALTIME.md §3`).
8. **أربعة تغييرات مالهمش موضوع WS واضح** (`docs/REALTIME.md §4`):
   تعاقد معرض، تغيير حالة إعلان، دفع رسوم دخول مزاد، تغيير دور مستخدم.
   كل واحد بيتغيّر من شاشة أدمن ومفعوله لازم يوصل لشاشة بوابة تانية —
   أي منهم يستاهل موضوع WS مخصّص (زي `exhibition:{id}`)، وأيهم مقبول
   polling لأنه نادر؟

---

## ٨. دليل حي — اختبار فعلي للتبديل (`USE_MOCK=false`)

النتيجة الكاملة بالأدلة (سكرينشوتس، طلبات شبكة، console) في
`reports/PHASE-5-BACKEND-READINESS.md §١`. **ملخّص:** شغّلنا سيرفر موك حقيقي
(`scripts/mock-backend.mjs`) على `:4000`، حطينا `NEXT_PUBLIC_API_URL` عليه،
شغّلنا اللوحتين، وسجّلنا دخول فعلي (OTP كامل عبر HTTP حقيقي، مش موك) في
الاتنين. **النتيجة: الادعاء صحيح** — الشاشات اتصفحت بلا أي تعديل كود،
الـendpoints المتغطّاة رجّعت بيانات حقيقية، والـendpoints الناقصة (زي
`stats/timeseries`) رجّعت رسالة خطأ واضحة برقم مرجع من غير ما توقّع
الصفحة — كل رسم بياني بيفشل لوحده بزرار «حاول تاني» (Error boundary
شغّال زي المطلوب في `MISSION.md §8`).
