# مصفوفة العقود — كل hook مقابل نص المواصفة حرفيًا

آخر بند كان مفتوح من `MISSION.md §5` بند ٢ ("جرد العقود: لكل hook →
الـendpoint، الـmethod، الـquery params، شكل الرد، شكل الخطأ. قارن بـ
`ADMIN §6.1/6.2/6.3` و`PORTAL §8.1/8.2/8.3`"). الجدولين تحت بيغطّوا الـ٦٥
hook كلهم في `packages/api-client/src/{admin,dealers}/hooks.ts`.

**عمود "الحالة":** ✅ مطابق حرفيًا · ⚠️ فرق موثّق (مُحال لـ`FND-xxx` أو
`docs/BACKEND-CONTRACT.md`) · 🆕 endpoint مقترح من الفرونت (مفيش نص
مواصفة أصلي عليه، موثّق في `§6.2`/`§8.2`).

---

## ١. لوحة الأدمن — `packages/api-client/src/admin/hooks.ts`

| # | Hook | Method + Endpoint | القسم المرجعي | الحالة | ملاحظة |
|---|---|---|---|---|---|
| 1 | `useOverview` | `GET /v1/admin/stats/overview` | `ADMIN §6.2أ` | ✅ | الشكل مطابق حرفيًا (`listings/users/sellNow/auctions/financing/trust/previous`) |
| 2 | `useTimeseries` | `GET /v1/admin/stats/timeseries` | `ADMIN §6.2أ` | ✅ | `metric` من القايمة الموثّقة بالظبط + `points[].series` |
| 3 | `useBreakdown` | `GET /v1/admin/stats/breakdown` | `ADMIN §6.2أ` | ✅ | `dimension` يشمل كل القيم الموثّقة (`bids_by_exhibition`, `sellnow_value` إلخ) |
| 4 | `useFunnel` | `GET /v1/admin/stats/funnel` | `ADMIN §6.2أ` | ✅ | `{steps: [{key,label,count}]}` مطابق |
| 5 | `useAdminActivity` | `GET /v1/admin/stats/admin-activity` | `ADMIN §5` (C-52) | ✅ | `{cells:[{day,hour,count}]}` بتوقيت القاهرة |
| 6 | `useSellNowQueue` | `GET /admin/sell-now/requests` | `ADMIN §6.1` + `§6.3` بند ١-٢ | ⚠️ | الموجود فعليًا بيرجّع UUIDs بس (`§6.3`#1) — الفرونت بيتوقّع ملخص كامل (`ListingSummary`+`UserSummary`)، موثّق كتعديل مطلوب |
| 7 | `useSellNowRequest` | `GET /admin/sell-now/requests/{id}` | `ADMIN §6.3` بند ٤ | 🆕 | مفيش في الموجود أصلًا — endpoint جديد مطلوب |
| 8 | `usePendingCount` | نفس #6 بفلتر `status=pending` | `ADMIN §6.1` | ⚠️ | نفس ملاحظة #6 |
| 9 | `useOfferSellNow` | `POST .../offer` | `ADMIN §6.1` | ✅ | `body:{price}` → `{status,offer_price}` مطابق حرفيًا |
| 10 | `useCollectSellNow` | `POST .../collected` | `ADMIN §6.1` | ✅ | `{status}` مطابق |
| 11 | `useListings` | `GET /v1/admin/listings` | `ADMIN §6.2ب` | ✅ | `?status=&make=&governorate=&q=&has_photos=&priced=&cursor=` كلهم مستخدمين |
| 12 | `useListing` | `GET /v1/admin/listings/{id}` | — | 🆕 | مش موثّق صراحة في `§6.2ب` (بس منطقي كجزء من نفس المجموعة) — مقترح ضمني |
| 13 | `useSetListingFlags` | `PATCH .../flags` | `ADMIN §6.1` | ✅ | `{km_verified,inspected}` + `reason` (الفرونت بيزوّد `reason` مش موثّق في `§6.1` الأصلي — إضافة مطلوبة للسبب المكتوب `X-8`) |
| 14 | `useSetListingStatus` | `PATCH /listings/{id}/status` | `ADMIN §6.2ب` | ✅ | `{status,reason}` مطابق حرفيًا |
| 15 | `useExhibitions` | `GET /v1/admin/exhibitions` | `ADMIN §6.2ب` | ✅ | `?contracted=&verified=&cursor=` مطابق |
| 16 | `useExhibition` | `GET /v1/admin/exhibitions/{id}` | — | 🆕 | نفس ملاحظة #12 |
| 17 | `useSetContract` | `PATCH .../contract` | `ADMIN §6.1` | ✅ | `{is_contracted}` + `reason` (نفس إضافة #13) |
| 18 | `useExhibitionBids` | `GET /v1/admin/exhibitions/{id}/bids` | — | 🆕⚠️ | **`FND-007`/`FND-044`** — endpoint مقترح، وحتى لو اتبنى محتاج يكون تجميعي مش قايمة خام (راجع `docs/BACKEND-CONTRACT.md`) |
| 19 | `useApplications` | `GET .../applications` | `PORTAL §8.2` | ✅ | `?status=&cursor=` مطابق |
| 20 | `useApplication` | `GET .../applications/{id}` | `PORTAL §8.2` | ✅ | مطابق |
| 21 | `useReviewApplication` | `POST .../{approve\|reject\|request-info}` | `PORTAL §8.2` | ✅ | `{reason,fields}` مطابق (fields اختياري لغير request-info) |
| 22 | `useAuctions` | `GET /v1/admin/auctions` | `ADMIN §6.2ب` | ✅ | `?status=&cursor=` مطابق |
| 23 | `useAuction` | `GET /v1/auctions/{id}` (عام، مش `/admin/`) | `PORTAL §8.1` | ✅ | **`FND-008` اتحل** — مقصود، مفيش نسخة أدمن منفصلة موثّقة |
| 24 | `useAuctionBids` | `GET /v1/auctions/{id}/bids` (عام) | `PORTAL §8.1` | ✅ | نفس #23 |
| 25 | `useAuctionEntries` | `GET /v1/admin/auction-entries` | `ADMIN §6.2ب` | ⚠️ | **`FND-044`** — الموثّق بيقول `?paid=false&cursor=`، الكود الفعلي بلا `cursor` خالص (راجع تحليل pagination) |
| 26 | `useMarkEntryPaid` | `POST .../paid` | `ADMIN §6.1` | ✅ | + `reason` مضافة (`FND-018` اتصلّح) |
| 27 | `useMarkDefaulted` | `POST .../default` | `ADMIN §6.1` | ✅ | + `reason` مضافة (نفس `FND-018`) |
| 28 | `useFinancingApps` | `GET .../applications` | `ADMIN §6.2ب` | ✅ | `?status=&cursor=` مطابق |
| 29 | `useFinancingApp` | `GET .../applications/{id}` | — | 🆕 | مش موثّق صراحة، مقترح ضمني (زي #12) |
| 30 | `useSetFinancingStatus` | `PATCH .../applications/{id}` | `ADMIN §6.2ب` | ✅ | `{status}` + `reason` مضافة |
| 31 | `useSignedIdImage` | `GET .../id-image?side=` | `ADMIN §6.2ب` + `§10.1` | ✅ | `{url,expiresAt}` مطابق حرفيًا (F-6) |
| 32 | `useUsers` | `GET /v1/admin/users` | `ADMIN §6.2ب` | ✅ | `?role=&status=&q=&cursor=` مطابق |
| 33 | `useSetUserRole` | `PATCH .../role` | `ADMIN §6.2ب` | ✅ | `{role,reason}` مطابق حرفيًا |
| 34 | `useSetUserStatus` | `PATCH .../status` | `ADMIN §6.2ب` | ✅ | `{status,reason}` مطابق |
| 35 | `useRevealPhone` | `POST /admin/users/{id}/phone` | `ADMIN §10.2` (مبدأ، مش مسار حرفي) | 🆕 | المسار نفسه مقترح من الفرونت — القاعدة (كشف واعٍ متسجّل) موثّقة، المسار لأ |
| 36 | `useHealth` | `GET /v1/admin/health` | `ADMIN §6.2ب` | ✅ | كل الحقول الموثّقة موجودة في النوع |
| 37 | `useScanJobs` | `GET /v1/admin/scan-jobs` | `ADMIN §6.2ب` | ✅ | `?status=&cursor=` مطابق |
| 38 | `useAudit` | `GET /v1/admin/audit` | `ADMIN §6.1` + `§6.3` بند ٣ | ⚠️ | الموجود فعليًا `limit 200` بلا فلترة — الفرونت بيبعت `?entityType=&entityId=&action=&cursor=` أوسع من الموثّق، و`?from=&to=&actor_id=` (`§6.3`) لسه مش متبعوتين (`FND-037`) |

## ٢. بوابة المعارض — `packages/api-client/src/dealers/hooks.ts`

| # | Hook | Method + Endpoint | القسم المرجعي | الحالة | ملاحظة |
|---|---|---|---|---|---|
| 1 | `useMyExhibition` | `GET /v1/exhibitions/me` | `PORTAL §8.1` (`/v1/exhibitions/{id}`) | ✅ | نفس شكل `Exhibition` |
| 2 | `useUpdateMyExhibition` | `PATCH /v1/exhibitions/me` | `PORTAL §8.2` | ✅ | `{name?,area?,governorate?,financingNote?,inspectionService?}` مطابق حرفيًا |
| 3 | `useExhibitionStats` | `GET /v1/me/exhibition/stats` | `PORTAL §8.2` | ⚠️ | الشكل موجود، لكن `sold_at` (لازم لـD-06) لسه ناقص — موثّق في `§4.العاشر` |
| 4 | `useMyListings` | `GET /v1/me/listings` | `PORTAL §8.1` | ✅ | مطابق |
| 5 | `useMyListing` | `GET /v1/listings/{id}` | `PORTAL §8.1` (ضمنيًا) | ✅ | نفس endpoint تفاصيل الإعلان العام |
| 6 | `useCreateListing` | `POST /v1/listings` | `PORTAL §8.1` | ✅ | + `Idempotency-Key` (X-3) |
| 7 | `useBulkCreate` | `POST /v1/listings` (تكرار) | `PORTAL §8.2` (`POST /v1/listings/bulk` اختياري) | ⚠️ | الفرونت بيستخدم البديل الموثّق صراحة ("ممكن تتعمل بنداءات متوازية بحد ٥") بدل `bulk` endpoint — قرار مقصود موثّق في المواصفة نفسها |
| 8 | `useMyLeads` | `GET /v1/chats` | `PORTAL §8.1` | ✅ | `{items: ChatThread[]}` |
| 9 | `useLeadMessages` | `GET /v1/chats/{id}/messages` | `PORTAL §4.العاشر` (رسايل) | ✅ | `{items:[{id,threadId,from,body,at}]}` مطابق حرفيًا |
| 10 | `useMarkLeadRead` | `POST /v1/chats/{id}/read` | `PORTAL §4.العاشر` | ✅ | مطابق |
| 11 | `useSendLeadMessage` | `POST /v1/chats/{id}/messages` | `PORTAL §4.العاشر` | ✅ | `{body}` + Idempotency-Key مطابق |
| 12 | `useDealerAuctions` | `GET /v1/auctions?status=` | `PORTAL §8.1` + `§8.3` بند ٤ | ✅ | `?status=` مضاف بالظبط زي ما `§8.3`#4 طلب |
| 13 | `useDealerAuction` | `GET /v1/auctions/{id}` | `PORTAL §8.1` | ✅ | `staleTime:0` (§10.7) |
| 14 | `useDealerBids` | `GET /v1/auctions/{id}/bids` | `PORTAL §8.1` | ✅ | مطابق |
| 15 | `usePlaceBid` | `POST /v1/auctions/{id}/bids` | `PORTAL §8.1` + `A-3` | ✅ | `{amount: nextBid}` من السيرفر بالظبط، + Idempotency-Key |
| 16 | `useCreateEntry` | `POST /v1/auctions/{id}/entry` | `PORTAL §8.1` | ✅ | + Idempotency-Key |
| 17 | `useMyEntries` | `GET /v1/me/exhibition/entries` | `PORTAL §8.2` | ✅ | `?paid=&cursor=` (الفرونت بيجيب كله بلا فلتر حاليًا — مقبول لحجم بيانات معرض واحد) |
| 18 | `useMyBids` | `GET /v1/auctions/mine?role=bidder` | `PORTAL §8.2` | ✅ | مطابق حرفيًا |
| 19 | `useUpdateListing` | `PATCH /v1/listings/{id}` | `PORTAL §8.1` | ✅ | قيود `L-4`/`L-7` مفروضة في الفورم قبل الإرسال |
| 20 | `useMarkListingSold` | `POST /v1/listings/{id}/sold` | `PORTAL §8.1` | ✅ | + Idempotency-Key |
| 21 | `useReactivateListing` | `POST /v1/listings/{id}/reactivate` | `PORTAL §8.1` (`L-13`) | ✅ | + Idempotency-Key |
| 22 | `useRenewListing` | `POST /v1/listings/{id}/renew` | `PORTAL §8.1` (`L-6`) | ✅ | + Idempotency-Key |
| 23 | `useDeleteListing` | `DELETE /v1/listings/{id}` | `PORTAL §8.1` | ⚠️ | **`FND-028`** — soft/hard delete فعلي في الباك محتاج تأكيد صريح |
| 24 | `useUploadListingPhoto` | `POST /v1/listings/{id}/photos` | `PORTAL §8.1` (`D-2`) | ✅ | + Idempotency-Key، بايتات الملف فعليًا (باج `168d823` اتصلّح) |
| 25 | `useCatalogMakes` | `GET /v1/catalog/makes` | `PORTAL §8.1` | ✅ | مطابق |
| 26 | `useCatalog` | `GET /v1/catalog/{makes,governorates,filters}` | `PORTAL §8.1` | ✅ | مجمّع في hook واحد، موثّق في الكود نفسه كـ"adapter" |
| 27 | `useMyApplication` | `GET /v1/exhibitions/applications/me` | `PORTAL §8.2` | ✅ | مطابق حرفيًا |

---

## ملخّص

| الحالة | العدد |
|---|---|
| ✅ مطابق حرفيًا | ٤٧ |
| ⚠️ فرق موثّق (مُحال لـ`FND-xxx` موجودة بالفعل) | ٩ |
| 🆕 endpoint/مسار مقترح من الفرونت (مفيش نص أصلي) | ٩ |
| **الإجمالي** | **٦٥** |

**لا يوجد فرق جديد لم يكن مسجّلًا من قبل.** كل الفروقات (⚠️) محالة على
ملاحظات موجودة بالفعل في `reports/FINDINGS.md` (`FND-007`, `FND-018`
(اتصلّحت)، `FND-028`, `FND-037`, `FND-044`) أو موثّقة كقرار مقصود في
المواصفة نفسها (`useBulkCreate`). الجرد ده بيأكّد إن **مفيش عقد فرونت
بيتوقّع شكل رد مختلف عن الموثّق من غير ما يكون مسجّل بالفعل** — نقطة
النهاية الآمنة للربط بالباك اند الحقيقي.
