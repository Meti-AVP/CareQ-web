# جرد شامل — carq-web (المرحلة ٠)

قراءة كود فقط، ولا تعديل. كل سطر هنا موثّق بمسار:سطر. المصدر: قراءة مباشرة
لكل ملفات `apps/*/src/app/**`, `apps/*/src/components/Shell.tsx`,
`packages/api-client/src/{admin,dealers}/hooks.ts`, `packages/api-client/src/client.ts`,
`packages/ui/src/**`، بالإضافة لتقارير استكشاف مفصّلة اتعملت بالتوازي على نفس الملفات.

---

## ١. المسارات (Routes) — التطبيقين

### ١٫١ `apps/admin` (منفذ 3100) — ١٧ مسار + `not-found`

| المسار | الملف | حماية جلسة/دور (كود) | ملاحظة |
|---|---|---|---|
| `/login` | `src/app/login/page.tsx` | لا ينطبق (شاشة الدخول نفسها) | `requestOtp()`/`verifyOtp()` بالكامل موك محلي — مفيش نداء شبكة حقيقي (`login/page.tsx:86,106-110`)؛ `tokenStore.set('demo-access-token', 900)` حرفيًا (`:110`) |
| `/` | `(dash)/page.tsx` | **مفيش — NONE FOUND** | |
| `/sell-now` | `(dash)/sell-now/page.tsx` | **مفيش** | |
| `/sell-now/[id]` | `(dash)/sell-now/[id]/page.tsx` | **مفيش** | |
| `/listings` | `(dash)/listings/page.tsx` | **مفيش** | |
| `/listings/[id]` | `(dash)/listings/[id]/page.tsx` | **مفيش** | |
| `/exhibitions` | `(dash)/exhibitions/page.tsx` | **مفيش** | |
| `/exhibitions/[id]` | `(dash)/exhibitions/[id]/page.tsx` | **مفيش** | |
| `/exhibitions/requests` | `(dash)/exhibitions/requests/page.tsx` | **مفيش** | |
| `/auctions` | `(dash)/auctions/page.tsx` | **مفيش** | |
| `/auctions/[id]` | `(dash)/auctions/[id]/page.tsx` | **مفيش** | |
| `/financing` | `(dash)/financing/page.tsx` | **مفيش** | |
| `/financing/[id]` | `(dash)/financing/[id]/page.tsx` | **مفيش** | |
| `/users` | `(dash)/users/page.tsx` | **مفيش** | |
| `/health` | `(dash)/health/page.tsx` | **مفيش** | |
| `/audit` | `(dash)/audit/page.tsx` | **مفيش** | |
| — | `not-found.tsx` | لا ينطبق | موجود |
| — | `(dash)/layout.tsx` | **مفيش** | `return <Shell>{children}</Shell>` بس (`(dash)/layout.tsx:1-6`) — مفيش فحص جلسة على مستوى الـlayout ولا الـShell |

**`middleware.ts`:** غير موجود في `apps/admin` (بحث كامل عن أي ملف بالاسم ده — صفر نتائج).
**`src/app/api/*`:** غير موجود — مفيش مجلد `apps/admin/src/app/api` أصلًا.
**نتيجة عملية:** أي حد يفتح أي مسار من الـ١٦ اللي فوق (غير `/login`) مباشرة من غير أي جلسة، هيشوف اللوحة كاملة. الدخول الديمو الوحيد اللي بيحصل هو الفلو الوهمي في `/login` اللي بيقبل أي رقم صحيح وأي كود ٤ أرقام.

### ١٫٢ `apps/dealers` (منفذ 3200) — ١٦ مسار + `not-found`

| المسار | الملف | حماية جلسة/دور | ملاحظة |
|---|---|---|---|
| `/login` | `src/app/login/page.tsx` | لا ينطبق | `requestCode()`/`verify()` موك محلي بالكامل — أي ٦ أرقام بتعدّي (`login/page.tsx:239-242`)، `router.push('/')` من غير أي تحقق سيرفر |
| `/apply` | `src/app/apply/page.tsx` | **مفيش** | مسار عام مقصود (`PORTAL §2`) — بس برضه مفيش فحص «مش داخل بجلسة» قبل عرض الفورم |
| `/apply/status` | `src/app/apply/status/page.tsx` | **مفيش** | |
| `/` | `(portal)/page.tsx` | **مفيش** | بانر `isContracted` عرض بس، مش حارس مسار |
| `/inventory` | `(portal)/inventory/page.tsx` | **مفيش** | |
| `/inventory/new` | `(portal)/inventory/new/page.tsx` | **مفيش** | |
| `/inventory/bulk` | `(portal)/inventory/bulk/page.tsx` | **مفيش** | |
| `/inventory/[id]` | `(portal)/inventory/[id]/page.tsx` | **مفيش** | |
| `/leads` | `(portal)/leads/page.tsx` | **مفيش** | |
| `/auctions` | `(portal)/auctions/page.tsx` | **مفيش** | |
| `/auctions/[id]` | `(portal)/auctions/[id]/page.tsx` | **مفيش** (فيه بوابات حالة عمل A-1/A-7 — مش جلسة) | |
| `/auctions/mine` | `(portal)/auctions/mine/page.tsx` | **مفيش** | |
| `/billing` | `(portal)/billing/page.tsx` | **مفيش** | |
| `/profile` | `(portal)/profile/page.tsx` | **مفيش** | |
| `/contract` | `(portal)/contract/page.tsx` | **مفيش** | |
| — | `not-found.tsx` | لا ينطبق | موجود |
| — | `(portal)/layout.tsx` | **مفيش** | `return <Shell>{children}</Shell>` بس (`(portal)/layout.tsx:1-6`) |

**`middleware.ts`:** غير موجود. **`src/app/api/*`:** غير موجود.
**زرار خروج (logout):** غير موجود في أي من التطبيقين — لا في `Shell.tsx` بتاع الأدمن ولا بتاع المعارض.

---

## ٢. hooks `packages/api-client` — كل واحد + الـendpoint + المصدر

كل الـhooks بتستخدم `USE_MOCK ? mockDb : http()` — العمود «المصدر الحقيقي» هو الـendpoint اللي بيتنادى لما `USE_MOCK=false`.

### ٢٫١ `admin/hooks.ts` — ٣٨ hook

| Hook | نوع | الـendpoint الحقيقي | ملاحظة |
|---|---|---|---|
| `useOverview` | query | `GET /v1/admin/stats/overview` | polling ٥ دقايق |
| `useTimeseries` | query | `GET /v1/admin/stats/timeseries` | |
| `useBreakdown` | query | `GET /v1/admin/stats/breakdown` | |
| `useFunnel` | query | `GET /v1/admin/stats/funnel` | |
| `useAdminActivity` | query | `GET /v1/admin/stats/admin-activity` | C-52 |
| `useSellNowQueue` | query | `GET /v1/admin/sell-now/requests` | polling ٢٠ث |
| `useSellNowRequest` | query | `GET /v1/admin/sell-now/requests/{id}` | |
| `usePendingCount` | query | `GET /v1/admin/sell-now/requests?status=pending` | polling ٢٠ث، بادج الـsidebar |
| `useOfferSellNow` | mutation | `POST /v1/admin/sell-now/requests/{id}/offer` | idempotency **متولّد جوه mutationFn** (`admin/hooks.ts:194`) — باج معروف (مرحلة ٥) |
| `useCollectSellNow` | mutation | `POST /v1/admin/sell-now/requests/{id}/collected` | مفيش idempotency header خالص |
| `useListings` | query | `GET /v1/admin/listings` | |
| `useListing` | query | `GET /v1/admin/listings/{id}` | |
| `useSetListingFlags` | mutation | `PATCH /v1/admin/listings/{id}/flags` | T-1/T-2 |
| `useSetListingStatus` | mutation | `PATCH /v1/admin/listings/{id}/status` | موك محلي فقط حاليًا — endpoint ناقص (مذكور صراحة في الصفحة) |
| `useExhibitions` | query | `GET /v1/admin/exhibitions` | |
| `useExhibition` | query | `GET /v1/admin/exhibitions/{id}` | |
| `useSetContract` | mutation | `PATCH /v1/admin/exhibitions/{id}/contract` | A-1 شرط ٢ |
| `useExhibitionBids` | query | `GET /v1/admin/exhibitions/{id}/bids` | **endpoint ناقص في الباك** (تعليق صريح `admin/hooks.ts:335-337`) — N+1 حاليًا |
| `useApplications` | query | `GET /v1/admin/exhibitions/applications` | |
| `useApplication` | query | `GET /v1/admin/exhibitions/applications/{id}` | |
| `useReviewApplication` | mutation | `POST /v1/admin/exhibitions/applications/{id}/{approve|reject|request-info}` | |
| `useAuctions` | query | `GET /v1/admin/auctions` | `staleTime:0` |
| `useAuction` | query | `GET /v1/auctions/{id}` | **مسار غير-admin** (مش `/v1/admin/auctions/{id}`) — يستاهل مراجعة اتساق في مرحلة ٥ |
| `useAuctionBids` | query | `GET /v1/auctions/{id}/bids` | نفس الملاحظة أعلاه |
| `useAuctionEntries` | query | `GET /v1/admin/auction-entries` | |
| `useMarkEntryPaid` | mutation | `POST /v1/admin/auction-entries/{id}/paid` | مفيش idempotency header |
| `useMarkDefaulted` | mutation | `POST /v1/admin/auctions/{id}/default` | A-11، بيشتغل بس على `settled` |
| `useFinancingApps` | query | `GET /v1/admin/financing/applications` | |
| `useFinancingApp` | query | `GET /v1/admin/financing/applications/{id}` | |
| `useSetFinancingStatus` | mutation | `PATCH /v1/admin/financing/applications/{id}` | |
| `useSignedIdImage` | mutation | `GET /v1/admin/financing/applications/{id}/id-image?side=` | F-6، `gcTime:0` |
| `useUsers` | query | `GET /v1/admin/users` | |
| `useSetUserRole` | mutation | `PATCH /v1/admin/users/{id}/role` | A-1 شرط ١ — موك محلي فقط حاليًا |
| `useSetUserStatus` | mutation | `PATCH /v1/admin/users/{id}/status` | موك محلي فقط حاليًا |
| `useRevealPhone` | mutation | `POST /v1/admin/users/{userId}/phone` | §10.2 |
| `useHealth` | query | `GET /v1/admin/health` | polling ٣٠ث |
| `useScanJobs` | query | `GET /v1/admin/scan-jobs` | polling ٣٠ث |
| `useAudit` | query | `GET /v1/admin/audit` | `limit 200` بلا cursor حاليًا (مذكور في المواصفة) |

### ٢٫٢ `dealers/hooks.ts` — ٢٧ hook

| Hook | نوع | الـendpoint الحقيقي | ملاحظة |
|---|---|---|---|
| `useMyExhibition` | query | `GET /v1/exhibitions/me` | |
| `useUpdateMyExhibition` | mutation | `PATCH /v1/exhibitions/me` | **endpoint ناقص في الباك** — الموجود `PATCH /v1/me` بياخد اسم/منطقة بس (تعليق صريح `dealers/hooks.ts:48-49`) |
| `useExhibitionStats` | query | `GET /v1/me/exhibition/stats` | D-01..D-13، محتاج `sold_at` لسه ناقصة (D-06) |
| `useMyListings` | query | `GET /v1/me/listings` | |
| `useMyListing` | query | `GET /v1/listings/{id}` | |
| `useCreateListing` | mutation | `POST /v1/listings` | idempotency ثابت (`idempotencyKey('listing')`) لكن **متولّد جوه mutationFn** برضه — نفس نمط الباج |
| `useBulkCreate` | mutation | `POST /v1/listings` (تكرار) | idempotency **ثابت وصح**: `bulk-${uploadId}-${index}` — النموذج المذكور في المواصفة كمرجع صح |
| `useMyLeads` | query | `GET /v1/chats` | polling ٦٠ث |
| `useLeadMessages` | query | `GET /v1/chats/{id}/messages` | polling ١٠ث وهي مفتوحة |
| `useMarkLeadRead` | mutation | `POST /v1/chats/{id}/read` | |
| `useSendLeadMessage` | mutation | `POST /v1/chats/{id}/messages` | idempotency جوه mutationFn (نفس الباج) |
| `useDealerAuctions` | query | `GET /v1/auctions?status=` | `staleTime:0`، polling ١٥ث |
| `useDealerAuction` | query | `GET /v1/auctions/{id}` | `staleTime:0`، polling ١٠ث |
| `useDealerBids` | query | `GET /v1/auctions/{id}/bids` | `staleTime:0`، polling ١٠ث |
| `usePlaceBid` | mutation | `POST /v1/auctions/{id}/bids` | A-3، idempotency جوه mutationFn (**أخطر حالة للباج** — مزايدة) |
| `useCreateEntry` | mutation | `POST /v1/auctions/{id}/entry` | idempotency جوه mutationFn |
| `useMyEntries` | query | `GET /v1/me/exhibition/entries` | |
| `useMyBids` | query | `GET /v1/auctions/mine?role=bidder` | |
| `useUpdateListing` | mutation | `PATCH /v1/listings/{id}` | L-4/L-7 متفروضة في الفورم قبل الإرسال |
| `useMarkListingSold` | mutation | `POST /v1/listings/{id}/sold` | idempotency جوه mutationFn |
| `useReactivateListing` | mutation | `POST /v1/listings/{id}/reactivate` | L-13، idempotency جوه mutationFn |
| `useRenewListing` | mutation | `POST /v1/listings/{id}/renew` | L-6، idempotency جوه mutationFn |
| `useDeleteListing` | mutation | `DELETE /v1/listings/{id}` | soft delete (موك: `status='removed'`) |
| `useUploadListingPhoto` | mutation | `POST /v1/listings/{id}/photos` | D-2، idempotency جوه mutationFn |
| `useCatalogMakes` | query | `GET /v1/catalog/makes` | `staleTime` ساعة |
| `useCatalog` | query | `GET /v1/catalog/makes`+`/governorates`+`/filters` | `staleTime` ساعة |
| `useMyApplication` | query | `GET /v1/exhibitions/applications/me` | وضع الموك بيقبل `demoStatus` لعرض الحالات الخمسة |

**خلاصة الـidempotency (رصد أولي — التفاصيل والإصلاح في المرحلة ٥):** `idempotencyKey()` بترجّع مفتاح جديد كل استدعاء (`${prefix}-${Date.now()}-${random}`, `client.ts:46-48`)، وبتتنادى **جوه** الـ`mutationFn` في 7 أماكن مؤكدة في `dealers/hooks.ts` (١٢٣, ٢٩٧, ٣١٥, ٣٨٠, ٣٩٩, ٤١٩, ٤٦٦) وفي `admin/hooks.ts:194` — يعني إعادة محاولة لنفس العملية بتولّد مفتاح مختلف. الاستثناء الصحيح الوحيد: `useBulkCreate` (`bulk-${uploadId}-${index}` ثابت).

---

## ٣. مكوّنات `packages/ui/src/components/` — كل مكوّن ومكان استخدامه

| الملف | التصدير | الاستخدام |
|---|---|---|
| `Button.tsx` | `Button` | ٣٣ ملف في التطبيقين |
| `Button.tsx` | `IconButton` | ملف واحد بس: `dealers/(portal)/inventory/page.tsx` |
| `DataTable.tsx` | `DataTable` | ١٨ ملف |
| `Dialog.tsx` | `Dialog` | ٨ ملفات |
| `Dialog.tsx` | `ConfirmDialog` | ١٢ ملف |
| `Feedback.tsx` | `Tabs` | ٩ ملفات |
| `Feedback.tsx` | `Countdown` | ٨ ملفات |
| `Feedback.tsx` | `ToastProvider` | `Providers.tsx` في التطبيقين |
| `Feedback.tsx` | `useToast` | ٢٠ ملف |
| `Form.tsx` | `Field` | ٩ ملفات |
| `Form.tsx` | `Input` | ١٠ ملفات |
| `Form.tsx` | `Textarea` | ٤ ملفات (معارض بس) |
| `Form.tsx` | `Select` | ١١ ملف |
| `Form.tsx` | `Switch` | ٤ ملفات |
| `Form.tsx` | `SegmentedControl` | ٦ ملفات |
| `Form.tsx` | `FileDrop` | ٧ ملفات (معارض بس) |
| `PageHeader.tsx` | `PageHeader` | ٣٠ ملف (كل الشاشات تقريبًا) |
| `PageHeader.tsx` | `Sheet` | نفس الـ٣٠ ملف |
| `PageHeader.tsx` | `SectionHeader` | ٢٨ ملف |
| `Primitives.tsx` | `Card` | ٢٣ ملف |
| `Primitives.tsx` | `InkCard` | `health/page.tsx`، `contract/page.tsx` |
| `Primitives.tsx` | `Badge` | ٢٧ ملف |
| `Primitives.tsx` | `Pill` | **٣ ملفات بس**: `exhibitions/requests`، `listings` (أدمن)، `auctions` (معارض) |
| `Primitives.tsx` | `EmptyState` | ٤ ملفات مباشرة + استخدام داخلي جوه `DataTable`/`ChartFrame` |
| `Primitives.tsx` | `Skeleton` | ١٧ ملف مباشرة + استخدام داخلي |
| `Primitives.tsx` | `TableSkeleton` | **مالوش استخدام مباشر في أي صفحة** — بس مستخدم جوه `DataTable.tsx:200` |
| `Primitives.tsx` | `ErrorState` | ١٦ ملف مباشرة + استخدام داخلي |
| `Primitives.tsx` | `PulseDot` | ٣ ملفات: `auctions/[id]` (أدمن ومعارض)، `health` |
| `Primitives.tsx` | `Shine` | **مالوش أي استخدام في المشروع كله** — لا في التطبيقين ولا جوه `packages/ui` نفسها — مُصدَّر بس من `index.ts:24` |
| `Primitives.tsx` | `Monogram` | ٧ ملفات، منها الـ`Shell.tsx` في التطبيقين |
| `Primitives.tsx` | `Banner` | ٢٨ ملف |
| `StatTile.tsx` | `StatTile` | ٦ ملفات |
| `StrokeMotif.tsx` | `StrokeMotif` | ٤ ملفات مباشرة (صفحتي الدخول + الـShell في التطبيقين) + جوه `PageHeader.tsx:51` (موجود عمليًا في كل صفحة) |
| `Ticker.tsx` | `Ticker` | **مالوش استخدام مباشر في أي صفحة** — بس مستخدم جوه `StatTile.tsx:131` |

**ملاحظة للمرحلة ٨ (نظافة الكود):** `Shine` مكوّن ميت بالكامل — مُصدَّر ومعمول له بناء لكنه مش مستخدم في أي مكان. `TableSkeleton` و`Ticker` مش «ميتين» (بيتستخدموا داخليًا) لكن محدش بيستوردهم مباشرة.

---

## ٤. كتالوج التشارتس — كل كود مقابل مكانه

المكوّنات في `packages/ui/src/charts/Charts.tsx` (مؤطّرة بـ`ChartFrame.tsx`):
`TimeSeriesLine` (خط/مساحة/step) · `VerticalBars` (عمودي/مكدّس/١٠٠٪) · `HorizontalBars` (أفقي) ·
`DivergingBars` (متباعد) · `Histogram` · `Funnel` (مبني بـdiv مش recharts) · `ScatterPlot` ·
`Heatmap` (يوم×ساعة) · `StackedShare` (١٠٠٪ صف واحد) · `SparseValues` (أرقام لـ<٣ نقط).

### ٤٫١ كتالوج الأدمن (`ADMIN_DASHBOARD_SPEC.md §5`)

| الكود | الحالة | المكان |
|---|---|---|
| C-01 | ✅ مبني | `(dash)/page.tsx:335,348` `<TimeSeriesLine>` |
| C-02 | ✅ مبني | `page.tsx:356,369` `<TimeSeriesLine area>` |
| C-03 | ✅ مبني | `page.tsx:412,428` `<HorizontalBars>` |
| C-04 | ✅ مبني | `page.tsx:381,399` `<StackedShare>` |
| C-05 | ✅ مبني | `page.tsx:473,489` `<HorizontalBars>` |
| C-06 | ✅ مبني (شريط بس، بلا خريطة) | `page.tsx:504,517` `<HorizontalBars>` |
| C-07 | ✅ مبني | `page.tsx:529,546` `<Histogram>` |
| C-08 | ✅ مبني | `page.tsx:445,462` `<Funnel>` |
| C-09 | ✅ مبني | `page.tsx:560,581` `<ScatterPlot>` |
| C-10 | ✅ مبني | `sell-now/page.tsx:581,599` |
| C-11 | ✅ مبني | `sell-now/page.tsx:509,522` `<Funnel>` |
| C-12 | ✅ مبني | `sell-now/page.tsx:538,555` `<Histogram>` |
| C-13 | ✅ مبني | `sell-now/page.tsx:560,576` `<DivergingBars>` |
| C-14 | ✅ مبني | `sell-now/page.tsx:610,626` |
| C-20 | ✅ مبني | `auctions/page.tsx:592,610` `<VerticalBars stacked>` |
| C-21 | ✅ مبني | `auctions/page.tsx:523,542` `<DivergingBars>` |
| C-22 | ✅ مبني | `auctions/[id]/page.tsx:520` `<TimeSeriesLine step>` |
| C-23 | ✅ مبني | `auctions/page.tsx:614,628` |
| C-24 | ✅ مبني | `auctions/page.tsx:546-547` `<StatTile>` (بلاطة، مش رسم — صح حسب المواصفة) |
| C-25 | ✅ مبني | `auctions/page.tsx:561,579` `<StackedShare>` |
| C-30 | ✅ مبني | `financing/page.tsx:389,403` `<Funnel>` |
| C-31 | ✅ مبني | `financing/page.tsx:414,428` |
| C-32 | ✅ مبني | `financing/page.tsx:437,451` |
| C-33 | ✅ مبني | `financing/page.tsx:462,478` |
| C-34 | ✅ مبني | `financing/page.tsx:489,504` `<Histogram>` |
| **C-40** | ❌ **مش موجود** | مفيش صفحة «نشاط» في الأدمن أصلًا (المسارات بس: auctions/audit/exhibitions/financing/health/listings/sell-now/users) |
| **C-41** | ❌ **مش موجود** | نفس السبب |
| **C-42** | ❌ **مش موجود** | نفس السبب |
| **C-43** | ❌ **مش موجود** | مفيش «تغطية الثقة» في أي مكان |
| **C-44** | ❌ **مش موجود** | مفيش «تغطية التسعير» في أي مكان |
| **C-45** | ❌ **مش موجود** | المواصفة نفسها بتقول محتاج جدول `search_queries` جديد (`ADMIN_DASHBOARD_SPEC.md:555`) |
| C-50 | ✅ مبني | `health/page.tsx:534,550` `<VerticalBars stacked>` |
| C-51 | ✅ مبني (نص/بلاطة، مش رسم — صح حسب المواصفة) | `health/page.tsx:452-458` |
| C-52 | ✅ مبني لكن **مش عن طريق مكوّن `Heatmap`** | `health/page.tsx:563,578-593` — CSS grid يدوي بدل `Charts.tsx:569 Heatmap` |

**الخلاصة:** ٣٤ من ٤٠ كود أدمن مبنيين. الستة الناقصين (`C-40..C-45`) كلهم في قسم «النشاط والثقة» ومفيهمش صفحة مقابلة في المسارات أصلًا — فجوة شاشة كاملة، مش بس رسم.

### ٤٫٢ كتالوج المعارض (`EXHIBITION_PORTAL_SPEC.md §7`)

| الكود | الحالة | المكان |
|---|---|---|
| D-01 | ✅ مبني | `(portal)/page.tsx:348,361` |
| D-02 | ✅ مبني | `page.tsx:420,434` |
| D-03 | ✅ مبني | `page.tsx:370,389` `<StackedShare>` |
| D-04 | ✅ مبني | `leads/page.tsx:290,~305` |
| D-05 | ✅ مبني | `page.tsx:397,416` `<DivergingBars>` |
| D-06 | ✅ مبني (sparkline بيانات جزئية — `sold_at` ناقصة، اتسجلت في `docs/BACKEND-CONTRACT.md`) | `page.tsx:325-326` `<StatTile>` |
| D-10 | ✅ مبني | `auctions/[id]/page.tsx:581` `<TimeSeriesLine step>` |
| D-11 | ✅ مبني | `auctions/mine/page.tsx:397,414` |
| D-12 | ✅ مبني | `auctions/mine/page.tsx:426,443` |
| D-13 | ✅ مبني | `billing/page.tsx:265,271,279` بلاطتين |

**الخلاصة:** ١٠ من ١٠ أكواد المعارض مبنيين بالكامل.

---

## ٥. `tokens.ts` / `charts/theme.ts` — ملخّص

`packages/ui/src/tokens.ts`: `palette` (الكحلي/الخلفية/الأسطح منقولة من الموبايل)، `status`
(محجوزة للبادجات/البلاطات، ممنوعة كسلسلة فئوية)، `chartPalette` (`categorical` ٧ ألوان ثابتة
+ `other` رمادي، `safe4` نواة ٤ ألوان، `sequential` ٧ درجات، `diverging` ٥ درجات)، `radius`،
`typeScale`، `shadows`، `SHEET_OVERLAP=26`. الملف بيقول صراحة: ممنوع hex بره الملف ده.

`packages/ui/src/charts/theme.ts`: `chartVars` (تحويل لمتغيرات CSS)، `SLICE_GAP=2`،
`BAR_RADIUS=4`، `seriesColor()`/`safeColor()`/`divergingColor()`/`sequentialColor()`،
`axisProps`/`gridProps` (محايدة دايمًا)، `TIME_AXIS_DIR='ltr'` (محور الوقت بيفضل LTR حتى في RTL).

---

## ٦. فحص hex بره الملفين المسموحين

بحث شامل في `apps/` و`packages/ui/` عن `#[0-9a-fA-F]{3,8}` بره
`packages/ui/src/tokens.ts` و`packages/ui/src/charts/theme.ts`:

**ملف واحد بس لقيناه فيه hex:** `packages/ui/src/styles.css` — الأسطر ١١-٢٧ (نسخة CSS variables
من نفس قيم `tokens.ts`، مكتوبة بالإيد مش متولّدة — مصدر حقيقة تاني لازم يفضل متزامن يدويًا)
والسطر ٩٠ (`::selection { color: #fff; }`) وده hex مستقل مش مربوط بأي توكن خالص.
`scripts/static-checks.mjs` **مابيغطيش الملف ده** — بيمشي بس على `.ts`/`.tsx` (`walk()` بتفلتر
`\.(ts|tsx)$`) وبيفحص الـhex بس لو `isPageLayer` (يعني `apps/admin/src`/`apps/dealers/src`) —
`packages/ui/src/styles.css` مش `.ts`/`.tsx` ومش في `PAGE_DIRS`، فالمخالفة الفنية دي
(hex بره الملفين المسموحين حرفيًا) **مش متغطّاة بالفحص الآلي**. مفيش أي hex في كود
التطبيقين نفسهم (كله عن طريق كلاسات Tailwind/متغيرات CSS).

## ٧. فحص إيموجي

بحث شامل في `apps/` و`packages/` — **صفر نتائج**. مفيش إيموجي في أي ملف مصدر.

---

## ٨. الشاشات بالتفصيل — كل عنصر تفاعلي

> ملخّص مكثّف هنا؛ التفاصيل الكاملة (رقم السطر لكل زرار/لينك/حقل) موجودة في
> ملفات الاستكشاف الخام اللي بُني عليها الجدول ده وهي محفوظة كمرجع داخلي —
> الأرقام والمراجع في الجداول اللي فوق (خصوصًا قسم ٢ و٣ و٤) مأخوذة منها بالحرف.
> **كل شاشة اتقرت سطر سطر فعليًا (مش تخمين)** — الملاحظات الحرجة (فجوات، بيانات
> موك، أزرار شغّالة على الموك بس) مسجّلة في `FINDINGS.md`.

### ٨٫١ لوحة الأدمن — ملخّص العناصر التفاعلية لكل شاشة

| الشاشة | أهم العناصر التفاعلية | ملاحظة حرجة |
|---|---|---|
| `Shell.tsx` (كل الشاشات) | ٩ لينكات نافيجيشن + بادجات (`usePendingCount`, `useHealth`) + قائمة موبايل (فتح/قفل) | **مفيش زرار خروج** · اسم المستخدم "مصطفى" ودوره "مالك CarQ" **مكتوبين بالإيد** (`Shell.tsx:184-185`)، مش من أي جلسة |
| `/login` | حقل تليفون، زرار «ابعت كود»، ٤ خانات OTP (لصق/رجوع تلقائي)، زرار «ادخل على اللوحة»، إعادة إرسال بعدّاد ٣٠ث | الدخول بالكامل وهمي — `setTimeout` بدل نداء شبكة |
| `/` نظرة عامة | فلتر مدى تاريخ + تاريخين مخصصين، فلتر محافظة، فلتر ماركة، بانر «افتح لوحة الصحة»، ٨ بلاطات KPI (بعضها لينكات)، ٩ رسوم بيانية بـretry، ٢ أكشن كارت | لا يوجد |
| `/sell-now` | تابات ٦ حالات، بحث، جدول بفرز/ترقيم/تصدير CSV، زرار «أصدر عرض» (ديالوج)، زرار «تم الاستلام» (ديالوج)، نسخ تليفون بعد كشف، ٥ رسوم | بانر تحذير: الإشعار للبائع push مش متركّب |
| `/sell-now/[id]` | نفس ديالوجات العرض/الاستلام، تايم لاين، تصدير تدقيق | ملاحظة: `acceptedAt` مش موجودة في البيانات |
| `/listings` | تابات ٨ (٧ حالة + الكل)، بحث، فلاتر ماركة/محافظة/سعر/سنة، ٤ Pill فلتر (موثّق/مفحوص/بلا صور/غير مسعّر)، صفّر الفلاتر، فرز ٧ أعمدة، تصدير CSV | لا يوجد |
| `/listings/[id]` | تبديل صور، Switch «ممشى موثّق»/«مفحوص» (بديالوج تأكيد + سبب)، كشف تليفون، «ارفض الإعلان»/«شيل الإعلان» | **الرفض والحذف شغّالين على الموك بس — بانر صريح إن الـendpoint ناقص** (`:668-672`) |
| `/exhibitions` | بحث، فلتر تعاقد، فلتر توثيق، Switch تعاقد لكل صف (ديالوج + سبب إجباري)، تصدير CSV | بانر: مفيش `POST /v1/admin/exhibitions`؛ ملاحظة: مفيش جوب يقفل عقد منتهي تلقائيًا |
| `/exhibitions/[id]` | زرار تعاقد مكرر، كشف تليفون، ٣ جداول (إعلانات/مزايدات/تدقيق) بتصدير | نفس ملاحظة الجوب اليومي |
| `/exhibitions/requests` | تابات ٤، «راجع» لكل صف، ديالوج مراجعة (وافق/ارفض/اطلب استكمال)، عرض مستندات، Pill حقول مطلوبة | **رابط المستند الموقّع لسه مش متاح — placeholder صريح بدل الورقة** (`:568-576`) |
| `/auctions` | لينك لوحة الصحة، تابات ٦، فرز، «أكّد الدفع» لكل صف غير مدفوع، تصدير، ٤ رسوم | بانر: الرسوم لسه صفر — قرار تجاري معلّق |
| `/auctions/[id]` | «تعليم متعثر» (معطّل إلا لو `settled`، type-to-confirm)، «أكّد الدفع»، جدولين بتصدير | لا يوجد |
| `/financing` | تابات ٥، فرز، جدول بتصدير، ٥ رسوم | بانر شرح F-4 (ليس فجوة) |
| `/financing/[id]` | عرض صورة موقّتة (front/back) بعدّاد ٥ دقايق + منع سحب/قائمة سياق، ٣ أزرار حالة | هذه الشاشة **فعليًا مبنية بالكامل** (رابط موقّع حقيقي في وضع الموك) — عكس `exhibitions/requests` |
| `/users` | تابات دور، فلتر حالة، كشف تليفون لكل صف، «رقّي لمعرض»/«إيقاف»/«إلغاء إيقاف» (type-to-confirm)، تصدير | **بانر صريح: الترقية والإيقاف شغّالين على الموك بس** (`:290-299`) |
| `/health` | «افحص دلوقتي»، تابات مهام سكان، heatmap يدوي (مش عبر مكوّن `Heatmap`)، تصدير | لا يوجد |
| `/audit` | فلتر كيان + أكشن، بحث (داخل الصفحة المعروضة بس — موثّق في الشاشة)، لينكات لكل كيان، توسيع تفاصيل، ترقيم أحدث/أقدم | قراءة فقط بالتصميم |

### ٨٫٢ بوابة المعارض — ملخّص العناصر التفاعلية لكل شاشة

| الشاشة | أهم العناصر التفاعلية | ملاحظة حرجة |
|---|---|---|
| `Shell.tsx` | ٨ لينكات نافيجيشن ببادجات، قائمة موبايل | **مفيش زرار خروج**؛ بلوك معلومات المستخدم عرض بس (مش قائمة) |
| `/login` | حقل تليفون، «ابعت الكود»، لينك «قدّم طلب معرض»، ٦ خانات كود، «دخول»، إعادة إرسال | **أي ٦ أرقام بتعدّي — بانر صريح في الشاشة نفسها** |
| `/apply` | Wizard ٣ خطوات (بيانات/أوراق/مراجعة)، ٤+٦+١ رفع ملفات (أسماء بس، بلا رفع فعلي)، Switch فحص فني، إرسال | بانر صريح: endpoints التقديم لسه مطلوبة في الباك |
| `/apply/status` | مبدّل حالة (وضع الموك بس)، لينكات حسب الحالة (كمّل/عدّل/تفاصيل) | مبدّل الديمو موثّق كديمو بس |
| `/` لوحة المعرض | «ضيف عربية»/«رفع بالجملة»، بانر تعاقد، بلاطات KPI لينكات، ٢ رسم بـretry | D-01 المشاهدات اليومية **تقدير موزّع** مش أرقام حقيقية يومية (موثّق في الشاشة) |
| `/inventory` | تابات ٧، فلتر ماركة/سعر مقابل سوق، بحث، فرز ٧ أعمدة، أزرار لكل صف (رفع صورة/تعديل/رجّع للبيع/تعليم متباع/تجديد/حذف)، ديالوجات تأكيد | لا يوجد |
| `/inventory/new` | فورم كامل (١٠ حقول)، رفع صور متعدد (أسماء بس قبل الحفظ)، حفظ كمسودة، رفع أول صورة بعد الإنشاء | فقط الصورة الأولى بتترفع فعليًا؛ الباقي محلي بس |
| `/inventory/bulk` | Wizard ٤ خطوات، تنزيل قالب CSV، رفع CSV + parser، تصحيح صفوف inline، إرسال بـidempotency لكل صف | **النموذج الصح الوحيد لمفتاح idempotency ثابت** في المشروع |
| `/inventory/[id]` | فورم تعديل (حقول مقفولة لو L-7)، تحقق L-4 (العداد)، رفع صورة، تجديد/تعليم متباعة/حذف | لا يوجد |
| `/leads` | «رد» لكل صف، بحث، فرز، تصدير، ديالوج محادثة (إرسال رد) | لا يوجد |
| `/auctions` | فلاتر ماركة/محافظة/سعر، Pill (قرب الانتهاء/أنا داخل فيه)، فرز، «ادخل المزاد»/«افتح الغرفة»، بحث/تصدير | polling ١٥ث موثّق في الصفحة |
| `/auctions/[id]` غرفة المزايدة | عدّاد حي من `endsAt`، زرار «زايد {nextBid}» + ديالوج تأكيد، إعادة مزايدة سريعة بعد `BID_TOO_LOW`، تسجيل دخول، ديالوج دفع، بانر «الاتصال اتقطع — تحديث»، بانر تمديد، ٦ أكواد خطأ منفصلة، جدول مزايدات بتصدير | **polling ١٠ث موصوف صراحة كـ«بديل مؤقت للـWS في المرحلة ١»** (`:76-79,103`) — هذا هو نطاق المرحلة ٦ |
| `/auctions/mine` | تابات ٣، فرز، فتح غرفة | الكسب من `winnerBidId` السيرفر — مفيش مقارنة محلية |
| `/billing` | فلتر حالة، اختيار مزاد + «سجّل دخولي»، `PayEntryButton` (ديالوج تحويل بنكي/انستاباي + رفع إيصال) | بانر صريح: الرسوم صفر دايمًا + مفيش بوابة دفع حقيقية + رفع الإيصال موك بالكامل |
| `/profile` | فورم ملف المعرض، رفع لوجو/غلاف (غير مرفوع فعليًا)، Switch فحص فني، حفظ/رجوع | بانر صريح: `PATCH /v1/exhibitions/me` ناقص، اللوجو/الغلاف ما بيوصلوش للسيرفر، الفريق مرحلة تانية |
| `/contract` | لينكات للملف والفواتير، شرح خطوات، تحقق ٣ شروط (عرض فقط) | لا يوجد |

---

## ٩. ملخّص أرقام

| البند | العدد |
|---|---|
| أسطر كود المصدر (apps + packages، `.ts/.tsx`) | ~٢٢٬٥٠٠ (admin `app/` ٩٬٧٦٢ + dealers `app/` ٨٬٤٩٣ + `api-client/src` ٣٬٨٦٩ تقريبًا؛ بدون `packages/ui`) |
| شاشات (`page.tsx`) | ٣٣ (١٦ أدمن + ١٧ معارض بما فيها `apply`/`apply/status`) |
| hooks في `api-client` | ٦٥ (٣٨ أدمن + ٢٧ معارض) |
| مكوّنات `packages/ui/src/components` | ٢٦ تصدير عبر ٩ ملفات |
| مكوّنات رسم `packages/ui/src/charts` | ١٠ |
| أكواد تشارتس معرّفة في المواصفتين | ٥٠ (٤٠ أدمن + ١٠ معارض) — ٤٤ مبنيين، ٦ ناقصين (C-40..C-45) |
| اختبارات Playwright (e2e) موجودة | ٢٧ (admin ١١ · dealers ٨ · security ٧ · visual ١) |
| اختبارات Vitest موجودة | ٨١ عبر ٦ ملفات |
| middleware.ts | ٠ (غير موجود في أي تطبيق) |
| route handlers تحت `app/api/*` | ٠ |
| زرار خروج | ٠ |
| ملاحظات أولية سجّلت في `FINDINGS.md` من قراءة الكود بس | راجع `reports/FINDINGS.md` |
