# فهرس أكواد القواعد — ADMIN_DASHBOARD_SPEC.md + EXHIBITION_PORTAL_SPEC.md

مرحلة ٠. فهرس بكل كود قاعدة (`A-1`, `SN-2` …) ظهر في المواصفتين، معناه، ومكانه
بالسطر. الأكواد المذكورة في `MISSION.md §2` كفهرس متوقّع اتغطّت كلها هنا.
بعض الأكواد (`D-2`, `D-4`) بتتحال على `docs/BUSINESS_RULES.md` — الملف ده
**مش موجود في الريبو ده** (مذكور في مقدمة المواصفتين كمرجع خارجي)، فمعناها
موصوف من السياق اللي اتذكر فيه بس مش معرّف بالكامل هنا — **ملاحظة فجوة توثيق**
مسجّلة في `FINDINGS.md`.

---

## ADMIN_DASHBOARD_SPEC.md

| كود | المعنى | المكان (سطر) |
|---|---|---|
| `SN-1` | `suggested_price = round(price × 0.91 / 1000) × 1000` — معادلة اقتراح سعر بيع حالًا | `docs/ADMIN_DASHBOARD_SPEC.md:161` |
| `SN-2` | طلب بيع حالًا فوق ١٫٥ مليون ج.م بيتحول لقرار بشري (`status='pending'`) بدل عرض تلقائي | `docs/ADMIN_DASHBOARD_SPEC.md:25,155,164-168` |
| `SN-3` | صلاحية العرض المصدَّر ٢٤ ساعة (`expires_at`) | `docs/ADMIN_DASHBOARD_SPEC.md:194` |
| `SN-7` | `accepted` = محجوزة (`listings.status=reserved`) **مش** متباعة؛ `collected` هي اللي بتخليها `sold` | `docs/ADMIN_DASHBOARD_SPEC.md:174-176` |
| `D-2` | الإعلان بيتنشر `draft` وأول صورة بتفعّله (مرجع خارجي — `BUSINESS_RULES.md`) | `docs/ADMIN_DASHBOARD_SPEC.md:141` (وموازيها `docs/EXHIBITION_PORTAL_SPEC.md:179`) |
| `D-4` | قرار بشري مطلوب لطلبات بيع حالًا فوق السقف (مرجع خارجي — `BUSINESS_RULES.md`، مش معرّف بالتفصيل هنا) | `docs/ADMIN_DASHBOARD_SPEC.md:25` |
| `A-1` | المزايدة محتاجة ٣ شروط مستقلة: `role='exhibition'` + `is_contracted=true` + `entry.paid_at != null` (`_authorize_bidder`) | `docs/ADMIN_DASHBOARD_SPEC.md:26,262-277` |
| `A-2` | `start_price` = ٨٥٪ من سعر الإعلان | `docs/ADMIN_DASHBOARD_SPEC.md:299-300` |
| `A-5` | تمديد ضد القنص (`extension_count`) | `docs/ADMIN_DASHBOARD_SPEC.md:301` |
| `A-11` | «تعليم متعثر» يشتغل بس على مزاد `status='settled'` — غير كده `AUCTION_NOT_SETTLED` | `docs/ADMIN_DASHBOARD_SPEC.md:308-316` |
| `A-12` | اسم المزايد علني داخل المزاد بالتصميم (مش تسريب) | `docs/ADMIN_DASHBOARD_SPEC.md:305-306` |
| `T-1` | شارة «ممشى موثّق» (`listings.km_verified`) — بس عن طريق الأدمن، ممنوعة من أي endpoint للبائع | `docs/ADMIN_DASHBOARD_SPEC.md:27,242-249` |
| `T-2` | شارة «مفحوص» (`listings.inspected`) — نفس قيد `T-1` | `docs/ADMIN_DASHBOARD_SPEC.md:27,242-249` |
| `X-1` | الفلوس أعداد صحيحة على السلك (مفيش floats/عملة عشرية في الـAPI) | `docs/ADMIN_DASHBOARD_SPEC.md:528` |
| `X-2` | كل تجميع بالتاريخ بتوقيت `Africa/Cairo` (مصر بتطبّق DST من ٢٠٢٣) | `docs/ADMIN_DASHBOARD_SPEC.md:525` |
| `X-4` | عقد الأخطاء الموحّد: `{ "error": { "code", "message" (عربي جاهز للعرض), "fields" } }` | `docs/ADMIN_DASHBOARD_SPEC.md:84-94` |
| `X-6` | مفيش حذف — كل حاجة soft delete، `audit_log` append-only للأبد | `docs/ADMIN_DASHBOARD_SPEC.md:389,749` |
| `X-8` | كل أكشن كتابة خطير بيسجّل صف تدقيق (`audit_log`) | `docs/ADMIN_DASHBOARD_SPEC.md:289,743` |
| `X-10` | شارات الثقة (`T-1`,`T-2`) ممنوعة من أي endpoint بيستخدمه البائع — المسار الوحيد أدمن | `docs/ADMIN_DASHBOARD_SPEC.md:242` |
| `F-4` | `quote_snapshot` (JSONB) هو مصدر الحقيقة لأرقام التمويل وقت التقديم — مايتحسبش من جديد بالنسب الحالية | `docs/ADMIN_DASHBOARD_SPEC.md:331-333` |
| `F-6` | صور البطاقة (`id_front_key`/`id_back_key`) مفاتيح تخزين مش روابط؛ رابط موقّع ٥ دقايق + تسجيل كل فتحة؛ قانون ١٥١/٢٠٢٠ | `docs/ADMIN_DASHBOARD_SPEC.md:338-340,727-734` |
| `I-4` | `access_token` عمره ١٥ دقيقة، `refresh_token` ٣٠ يوم وبيتدوّر مع كل استخدام | `docs/ADMIN_DASHBOARD_SPEC.md:73-74` |
| `L-5` | فرونت الموبايل بيشوف `active`/`sold` بس لأن الباك «بيسقّط» الحالات؛ الداشبورد لازم تشوف السبعة كاملين | `docs/ADMIN_DASHBOARD_SPEC.md:223-225` |
| `P-4` | `market_avg = null` معناها «مش متسعّر» — شريحة/حالة صريحة، مش صفر ومش مخفية | `docs/ADMIN_DASHBOARD_SPEC.md:413,679-684` |
| `R-1` | WebSocket على `{API_URL}/v1/ws` بمواضيع `chat:{thread_id}` · `auction:{auction_id}` · `user:{user_id}` — **مفيش موضوع `admin:*`** | `docs/ADMIN_DASHBOARD_SPEC.md:705-708` |
| `C-01`…`C-09` | تشارتس نظرة عامة (منشورة/يوم، مستخدمين جدد، توزيع حالات، مؤشر سعر عادل، أعلى ماركات، جغرافي، هيستوجرام أسعار، قمع نشر، scatter) | `docs/ADMIN_DASHBOARD_SPEC.md:406-419` |
| `C-10`…`C-14` | تشارتس بيع حالًا (طلبات/يوم، قمع، زمن رد، عرض مقابل اقتراح diverging، قيمة بالحالة) | `docs/ADMIN_DASHBOARD_SPEC.md:420-429` |
| `C-20`…`C-25` | تشارتس مزادات (مزادات/أسبوع، ارتفاع فوق البداية، منحنى step، أنشط معارض، معدل نجاح، رسوم دخول) | `docs/ADMIN_DASHBOARD_SPEC.md:430-440` |
| `C-30`…`C-34` | تشارتس تمويل (قمع، مدة، مقدم، عادي/مرابحة، قسط شهري) | `docs/ADMIN_DASHBOARD_SPEC.md:441-450` |
| `C-40`…`C-45` | تشارتس نشاط/ثقة (رسايل، محادثات، إشعارات، تغطية ثقة، تغطية تسعير، بحثات) | `docs/ADMIN_DASHBOARD_SPEC.md:451-460` |
| `C-50`…`C-52` | تشارتس صحة النظام (مهام سكان، عمر أقدم مهمة، heatmap نشاط أدمن بتوقيت القاهرة) | `docs/ADMIN_DASHBOARD_SPEC.md:462-469` |

## EXHIBITION_PORTAL_SPEC.md

| كود | المعنى | المكان (سطر) |
|---|---|---|
| `A-0` | القاعدة الحاكمة: السيرفر بيقرر، الواجهة بتعرض بس؛ المزايدة أخطر صلاحية في النظام | `docs/EXHIBITION_PORTAL_SPEC.md:13-15,383,566` |
| `A-1` | نفس شروط المزايدة الثلاثة (مرجع مشترك مع ADMIN) | `docs/EXHIBITION_PORTAL_SPEC.md:26-33` |
| `A-2` | `start_price` = ٨٥٪ من سعر الإعلان | `docs/EXHIBITION_PORTAL_SPEC.md:225` |
| `A-3` | `nextBid`/`bidStep` من السيرفر فقط؛ رفض بـ`BID_TOO_LOW`/`BID_NOT_ON_STEP` | `docs/EXHIBITION_PORTAL_SPEC.md:260-265` |
| `A-4` | قفل صف يسلسل المزايدات المتزامنة (`BID_TOO_LOW` = حد سبقك بثانية) | `docs/EXHIBITION_PORTAL_SPEC.md:322-323` |
| `A-5` | تمديد ٦٠ ثانية، حد أقصى ٢٠ مرة، `auction.extended` بيغيّر `endsAt` | `docs/EXHIBITION_PORTAL_SPEC.md:298-299` |
| `A-6` | العداد التنازلي محسوب من `endsAt` السيرفر — مش رقم بينقص محليًا | `docs/EXHIBITION_PORTAL_SPEC.md:232-234` |
| `A-7` | ممنوع تزايد على عربيتك (`CANNOT_BID_OWN_LISTING`) — اخفاء الزرار + استقبال الخطأ | `docs/EXHIBITION_PORTAL_SPEC.md:316,567-568` |
| `A-8` | الووركر هو اللي بيقفل المزاد (`auction.ended`) مش الشاشة | `docs/EXHIBITION_PORTAL_SPEC.md:303-304` |
| `A-12` | أسماء المزايدين علنية جوه المزاد بالتصميم؛ أرقام تليفونات المعارض التانية **مش** علنية | `docs/EXHIBITION_PORTAL_SPEC.md:569-570` |
| `D-2` | `draft` = مفعّل بأول صورة (نفس `D-2` في ADMIN) | `docs/EXHIBITION_PORTAL_SPEC.md:178-180` |
| `D-01`…`D-06` | تشارتس لوحة المعرض (مشاهدات/يوم، أداء عربيات، حالة مخزون، استفسارات/يوم، تسعير مقابل سوق diverging، متوسط أيام حتى البيع) | `docs/EXHIBITION_PORTAL_SPEC.md:408-413` |
| `D-10`…`D-13` | تشارتس مزادات المعرض (منحنى مزاد step، مزايدات مقابل مكاسب، ارتفاع فوق البداية، رسوم مقابل مكاسب) | `docs/EXHIBITION_PORTAL_SPEC.md:414-417` |
| `F-6` | أوراق السجل التجاري/البطاقة الضريبية بنفس عقيدة صور البطاقة — تخزين `private/`، رابط موقّع ٥ دقايق، تسجيل فتحة | `docs/EXHIBITION_PORTAL_SPEC.md:100-102,571-572` |
| `I-1` | المعرض حساب فرد اترقّى — مفيش «إنشاء حساب معرض» منفصل | `docs/EXHIBITION_PORTAL_SPEC.md:65-66` |
| `I-2` | الهوية والتليفون والإعلانات بتفضل نفسها بعد الترقية | `docs/EXHIBITION_PORTAL_SPEC.md:65-66` |
| `L-3` | حدود الرفع بالجملة: `price` ١٠٬٠٠٠–١٠٠٬٠٠٠٬٠٠٠ · `year` ١٩٥٠–السنة+١ · `km` ٠–٢٬٠٠٠٬٠٠٠ | `docs/EXHIBITION_PORTAL_SPEC.md:199-200` |
| `L-4` | العداد (`km`) مابينقصش — أي تعديل بيقلله بيترفض | `docs/EXHIBITION_PORTAL_SPEC.md:185-186` |
| `L-6` | `renew` — تجديد الإعلان TTL ٣٠ يوم | `docs/EXHIBITION_PORTAL_SPEC.md:172` |
| `L-7` | قيود التعديل: عربية في مزاد شغال/بيع حالًا مفتوح — السعر/العداد/السنة/الماركة/الموديل مايتغيّروش | `docs/EXHIBITION_PORTAL_SPEC.md:181-184` |
| `L-12` | تحذير تكرار في الرفع بالجملة (نفس ماركة+موديل+سنة+عداد قريب من إعلان نشط) | `docs/EXHIBITION_PORTAL_SPEC.md:202-203` |
| `L-13` | `reactivate` — إلغاء تعليم «متباعة» ورجوعها «نشطة» | `docs/EXHIBITION_PORTAL_SPEC.md:171` |
| `P-4` | نفس قاعدة `market_avg=null` (مستبعدة من `D-05` مش صفر) | `docs/EXHIBITION_PORTAL_SPEC.md:419-421` |
| `R-3` | استرجاع الأحداث الفايتة عند الاشتراك (`since: lastEventId`) | `docs/EXHIBITION_PORTAL_SPEC.md:276-277` |
| `R-4` | تجديد التوكن على سوكت شغّال: `{type:'auth', token: newAccessToken}` | `docs/EXHIBITION_PORTAL_SPEC.md:288-289` |
| `X-3` | `Idempotency-Key` مستقل لكل صف في الرفع بالجملة (`bulk-<uploadId>-<rowIndex>`) | `docs/EXHIBITION_PORTAL_SPEC.md:207-209,573-574` |
| `X-7` | حدود المعدل: ٦٠ مزايدة/دقيقة، ١٠ مزادات/ساعة — `429` بتعطيل مؤقت لا إعادة محاولة تلقائية | `docs/EXHIBITION_PORTAL_SPEC.md:320,575-577` |

---

## ملاحظات فهرسة

1. **`D-2` و`D-4`** مذكورين في المواصفتين لكن تعريفهم الكامل في
   `docs/BUSINESS_RULES.md` وده ملف **مش موجود في الريبو ده** (غير `MISSION.md`
   ولا أي ملف تحت `docs/`). المعنى المكتوب فوق مستنتج من السياق اللي بيتذكروا
   فيه بس. → مسجّلة `FND-` في `FINDINGS.md` كفجوة توثيق (ليست فجوة كود).
2. **أكواد MISSION.md §2 المتوقعة بالكامل اتغطّت**: `A-*` (بما فيهم `A-0` من
   البوابة و`A-1,2,5,11,12` من الأدمن)، `C-01..C-52`، `D-*` (`D-2/D-4` خارجي،
   `D-01..D-13` تشارتس)، `F-4,F-6`، `I-1,2,4`، `L-3,4,5,6,7,12,13`، `P-4`،
   `R-1,3,4`، `SN-1,2,3,7`، `T-1,2`، `X-1,2,3,4,6,7,8,10`.
3. الأكشنات الأربعة «الخطرة» في `MISSION.md §3.6.4` (التعاقد · ترقية الدور ·
   الإيقاف · المزاد المتعثر) بتتقاطع مع `A-11` (تعليم متعثر) و`X-8` (تدقيق)
   بس مالهاش كود مستقل في المواصفتين — قاعدة عامة من `MISSION.md` نفسه.
