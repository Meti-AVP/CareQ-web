# النشر والاستضافة — CarQ Web

## القرار المعماري: مشروعين منفصلين

`apps/admin` و `apps/dealers` بيتنشروا كـ**مشروعين مستقلين** على نطاقين
مختلفين — مش تطبيق واحد بمسارين.

| | |
|---|---|
| `admin.carq.eg` | داشبورد الأدمن — حسابات معدودة |
| `dealers.carq.eg` | بوابة المعارض — مئات الحسابات |

**ليه الفصل مقصود:** لوحة فيها أرقام تليفونات وصور بطاقات مالهاش لازمة
تتشارك حزمة جافاسكربت ولا كوكيز مع بوابة عامة. الفصل ده بيقلّل سطح الهجوم
فعليًا، ومش رفاهية تنظيمية.

الكود المشترك بيفضل مشترك عن طريق `packages/ui` و `packages/api-client` —
فالهوية والعقود واحدة من غير ما الحزم تتخلط.

---

## Vercel (الأسهل والموصى به)

اعمل **مشروعين** من نفس الريبو:

| الإعداد | admin | dealers |
|---|---|---|
| Root Directory | `apps/admin` | `apps/dealers` |
| Framework | Next.js | Next.js |
| Install Command | `npm install` (من الجذر تلقائيًا) | نفسه |
| Build Command | `next build` (الافتراضي) | نفسه |
| Node | 20 أو أحدث | نفسه |

Vercel بيفهم npm workspaces لوحده وبيثبّت من الجذر — فالحزم المشتركة
بتتبني مع كل تطبيق (عن طريق `transpilePackages`).

**متغيرات البيئة** (لكل مشروع):

```
NEXT_PUBLIC_API_URL = https://api.carq.eg
```

> سيبه فاضي عشان الموقع يفضل شغال على **الموك** — مفيد للعرض قبل ما
> الباك اند يجهز.

---

## أي استضافة تانية (Node)

```bash
npm install
npm run build:admin
cd apps/admin && npm run start   # المنفذ 3100
```

نفس الخطوات لـ`dealers` (المنفذ 3200)، وحطهم ورا reverse proxy.

### Docker (مثال مختصر)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY apps/admin ./apps/admin
RUN npm install --workspaces --include-workspace-root
RUN npm run build:admin

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3100
CMD ["npm", "run", "start", "--workspace=@carq/admin"]
```

---

## قبل أول نشر إنتاجي — قائمة إلزامية

- [ ] `NEXT_PUBLIC_API_URL` مضبوط، و`USE_MOCK` بقى `false` (اتأكد من الشبكة).
- [ ] الأنواع متولّدة من `/openapi.json` مش مكتوبة بالإيد.
- [ ] **الـrefresh token في httpOnly cookie** عن طريق Next route handler —
      مش `localStorage`. (الـaccess token في الذاكرة بالفعل.)
- [ ] `admin` **مستبعد من محركات البحث** — `robots: noindex` موجود في
      `layout.tsx`، وأضف `X-Robots-Tag` على مستوى الاستضافة كمان.
- [ ] HTTPS إجباري + HSTS. **ملاحظة:** هيدرات HSTS و`upgrade-insecure-requests`
      (`security-headers.mjs`) مشروطة بـ`isHttpsDeployment` — بتتفعّل
      تلقائي على Vercel (`VERCEL=1`)، وعلى أي استضافة تانية لازم تحطّوا
      `FORCE_HTTPS_HEADERS=true` صراحة **بس لو فعلًا وراها TLS حقيقي**
      (غير كده أي طلب تالٍ للأصل بيفشل بـ`ERR_SSL_PROTOCOL_ERROR` —
      تفاصيل `reports/PHASE-5-BACKEND-READINESS.md`).
- [ ] CSP: ممنوع `unsafe-eval`، وحصر `img-src` على نطاق التخزين بتاعك.
- [ ] **الروابط الموقّعة لصور البطاقة عمرها ٥ دقايق فعلًا** على السيرفر —
      الواجهة بتعرض عداد، بس السيرفر هو اللي بيفرض.
- [ ] تحديد معدل على نقاط الدخول (OTP) — من جهة الباك.
- [ ] النسخ الاحتياطي لسجل التدقيق (append-only، عمره ما يتمسح).
- [ ] اختبار الصفحات **والقاعدة فاضية** — ده وضع يوم الإطلاق الحقيقي.

---

## ملاحظة على الأداء

الصفحات client components لأنها كلها تفاعل وpolling. لو الجداول كبرت
(> ٥ آلاف صف)، الخطوة الجاية هي تحويل صفحات القوايم لـServer Components
مع `searchParams` — البنية مستعدة لده، بس **متعملهوش قبل ما تحتاجه**.
