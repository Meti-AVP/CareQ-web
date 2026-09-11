'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  Gavel,
  Hourglass,
  Lock,
  PartyPopper,
  PencilLine,
  Send,
  Store,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  formatDateAr,
  relTimeAr,
  secondsUntil,
  withThousands,
} from '@carq/ui';
import { mockDb } from '@carq/api-client';
import type { ApplicationStatus, ExhibitionApplication } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/apply/status` — حالة طلب الترقية (EXHIBITION_PORTAL_SPEC §2.3)
 *
 * خمس حالات، وكل واحدة **شاشة مختلفة** مش نص مختلف جوه نفس الكارت.
 * السبب: المعرض اللي طلبه واقف محتاج يعرف الخطوة الجاية بالظبط —
 * «قيد المراجعة» من غير خطوة بيولّد مكالمة دعم.
 *
 * الـSegmentedControl فوق للديمو بس: بيبدّل الحالة عشان الخمس شاشات
 * تتراجع من غير ما تستنى قرار أدمن حقيقي.
 * ════════════════════════════════════════════════════════════════
 */

const DEMO_STATES: Array<{ value: ApplicationStatus; label: string }> = [
  { value: 'draft', label: 'مسودة' },
  { value: 'submitted', label: 'مقدَّم' },
  { value: 'needs_info', label: 'محتاج استكمال' },
  { value: 'approved', label: 'اتوافق' },
  { value: 'rejected', label: 'مرفوض' },
];

const FIELD_LABELS: Record<string, string> = {
  commercial_register: 'صورة السجل التجاري',
  tax_card: 'صورة البطاقة الضريبية',
  owner_id_front: 'بطاقة المالك — الوش',
  owner_id_back: 'بطاقة المالك — الضهر',
  venue_photo: 'صور المعرض',
  logo: 'لوجو المعرض',
  name: 'اسم المعرض',
  phone: 'تليفون المعرض',
  address: 'العنوان بالتفصيل',
  tax_id: 'الرقم الضريبي',
};

const REAPPLY_DAYS = 30;
const DAY_SECONDS = 86_400;

function SummaryGrid({ app }: { app: ExhibitionApplication }) {
  const rows = [
    { k: 'اسم المعرض', v: app.name },
    { k: 'اسم المالك', v: app.ownerName },
    { k: 'تليفون المعرض', v: app.phone },
    { k: 'المحافظة والمنطقة', v: `${app.governorate} — ${app.area}` },
    { k: 'العنوان', v: app.address },
    { k: 'رقم السجل التجاري', v: app.commercialRegister },
    { k: 'الرقم الضريبي', v: app.taxId },
    { k: 'فحص فني', v: app.inspectionService ? 'بنقدّمه' : 'مش بنقدّمه' },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.k} className="border-b border-line pb-2 last:border-0">
          <dt className="text-caption text-content-sub">{r.k}</dt>
          <dd className="mt-0.5 text-sub font-bold text-content">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocsList({ app, requested = [] }: { app: ExhibitionApplication; requested?: string[] }) {
  const kinds = Object.keys(app.documents);
  if (!kinds.length) return null;
  return (
    <ul className="space-y-2">
      {kinds.map((k) => {
        const needed = requested.includes(k);
        return (
          <li
            key={k}
            className={`flex items-center justify-between gap-3 rounded-xs px-3.5 py-2.5 ${
              needed ? 'bg-warn-soft' : 'bg-surface-alt'
            }`}
          >
            <span className={`text-sub ${needed ? 'font-bold text-warn' : 'text-content'}`}>
              {FIELD_LABELS[k] ?? k}
            </span>
            {needed ? (
              <Badge tone="warn" icon={<AlertTriangle />}>
                محتاجة استكمال
              </Badge>
            ) : (
              <span className="flex items-center gap-1.5 text-caption text-content-sub">
                <Lock className="h-3.5 w-3.5" />
                متخزنة تحت private
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ApplyStatusPage() {
  const [status, setStatus] = useState<ApplicationStatus>('submitted');

  const app = useMemo(
    () => mockDb.applications.find((a) => a.status === status) ?? mockDb.applications[0],
    [status],
  );

  const reapplyAt = app?.reviewedAt
    ? new Date(new Date(app.reviewedAt).getTime() + REAPPLY_DAYS * DAY_SECONDS * 1000)
    : null;
  const reapplyDaysLeft = reapplyAt ? Math.ceil(secondsUntil(reapplyAt) / DAY_SECONDS) : 0;

  const headerSubtitle: Record<ApplicationStatus, string> = {
    draft: 'طلبك لسه مسودة — مامتبعتش',
    submitted: 'طلبك وصلنا وفي طابور المراجعة',
    needs_info: 'محتاجين منك حاجة واحدة عشان نكمّل',
    approved: 'مبروك — حسابك بقى معرض',
    rejected: 'الطلب اتّرفض، والسبب مكتوب',
  };

  return (
    <main className="min-h-screen bg-canvas">
      <PageHeader
        title="حالة طلبي"
        subtitle={headerSubtitle[status]}
        motif="oval"
        actions={
          <Link href="/login">
            <Button variant="white" size="sm">
              دخول
            </Button>
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-caption text-white/55">بدّل الحالة لمراجعة الشاشات</span>
          <SegmentedControl
            options={DEMO_STATES}
            value={status}
            onChange={setStatus}
            size="sm"
            className="!bg-white/10 [&_button]:text-white/70 [&_button[aria-selected=true]]:!bg-white [&_button[aria-selected=true]]:!text-ink"
          />
        </div>
      </PageHeader>

      <Sheet>
        <div className="mx-auto max-w-3xl space-y-4">
          {!app ? (
            <Card padded={false}>
              <EmptyState
                title="مفيش طلب"
                hint="ابدأ طلب جديد وهتلاقي حالته هنا."
                action={
                  <Link href="/apply">
                    <Button>قدّم طلب</Button>
                  </Link>
                }
              />
            </Card>
          ) : null}

          {/* ═════ مسودة ═════ */}
          {app && status === 'draft' ? (
            <>
              <Card className="animate-rise border-line-strong">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-content-sub">
                    <PencilLine className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-h2 text-content">كمّل طلبك</p>
                    <p className="mt-1.5 text-body text-content-sub">
                      اللي كتبته محفوظ. الطلب ماوصلناش لسه — عشان المراجعة تبدأ لازم تبعته.
                    </p>
                    <p className="mt-2 text-caption text-content-faint">
                      آخر تعديل {relTimeAr(app.createdAt)}
                    </p>
                    <Link href="/apply" className="mt-4 inline-block">
                      <Button icon={<ClipboardList />} iconEnd={<ArrowLeft />}>
                        كمّل الطلب
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>

              <Card>
                <SectionHeader title="اللي اتسجّل لحد دلوقتي" hint="بيتحفظ تلقائي وإنت بتكتب" />
                <SummaryGrid app={app} />
              </Card>
            </>
          ) : null}

          {/* ═════ مقدَّم ═════ */}
          {app && status === 'submitted' ? (
            <>
              <Card className="animate-rise border-accent/30 bg-accent-soft/40">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-accent">
                    <Hourglass className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-h2 text-content">طلبك وصلنا</p>
                    <p className="mt-1.5 text-body text-content-sub">
                      المراجعة بتاخد ٢ لـ ٣ أيام عمل. هنبعتلك رسالة على {app.phone} أول ما يبقى في
                      قرار — سواء موافقة أو طلب استكمال.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="neutral" icon={<CalendarClock />}>
                        اتقدّم {formatDateAr(app.createdAt)}
                      </Badge>
                      <Badge tone="accent" icon={<Hourglass />}>
                        {relTimeAr(app.createdAt)} في الطابور
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <SectionHeader title="ملخص اللي اتقدّم" hint="نفس اللي فريق المراجعة شايفه" />
                <SummaryGrid app={app} />
              </Card>

              <Card>
                <SectionHeader title="الأوراق المرفقة" hint="متخزنة تحت private وبتتعرض بروابط موقّعة ٥ دقايق" />
                <DocsList app={app} />
              </Card>
            </>
          ) : null}

          {/* ═════ محتاج استكمال ═════ */}
          {app && status === 'needs_info' ? (
            <>
              <Banner
                tone="warn"
                icon={<AlertTriangle />}
                title="محتاجين منك استكمال"
                className="animate-rise"
              >
                {app.reviewNote ?? 'في حاجة ناقصة في الطلب.'}
              </Banner>

              <Card>
                <SectionHeader
                  title="المطلوب بالظبط"
                  hint="دي الحاجات المعلّمة من فريق المراجعة — الباقي مقبول"
                />
                {app.requestedFields?.length ? (
                  <ul className="space-y-2">
                    {app.requestedFields.map((f) => (
                      <li
                        key={f}
                        className="flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn-soft px-4 py-3"
                      >
                        <span className="text-sub font-bold text-warn">
                          {FIELD_LABELS[f] ?? f}
                        </span>
                        <Badge tone="warn" icon={<AlertTriangle />}>
                          محتاجة تعديل
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sub text-content-sub">
                    فريق المراجعة ماحددش حقول بعينها — اقرا الملاحظة فوق وراجع الطلب كله.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link href="/apply">
                    <Button icon={<Send />}>عدّل وابعت تاني</Button>
                  </Link>
                  <p className="text-caption text-content-faint">
                    إعادة الإرسال بترجّع الطلب لطابور المراجعة من أول وجديد.
                  </p>
                </div>
              </Card>

              <Card>
                <SectionHeader title="الأوراق" hint="الأصفر هو المطلوب استبداله" />
                <DocsList app={app} requested={app.requestedFields ?? []} />
              </Card>
            </>
          ) : null}

          {/* ═════ اتوافق ═════ */}
          {app && status === 'approved' ? (
            <>
              <Card className="animate-rise border-ok/30 bg-ok-soft/50">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-ok">
                    <PartyPopper className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-h2 text-content">مبروك — {app.name} بقى معرض على CarQ</p>
                    <p className="mt-1.5 text-body text-content-sub">
                      حسابك اترقّى وشارة التوثيق اتفعّلت. إعلاناتك القديمة زي ما هي — مانقلناش
                      حاجة ومامسحناش حاجة.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="ok" icon={<CheckCircle2 />}>
                        الدور: معرض
                      </Badge>
                      <Badge tone="ok" icon={<Store />}>
                        ملف عام للمشترين
                      </Badge>
                      {app.reviewedAt ? (
                        <Badge tone="neutral" icon={<CalendarClock />}>
                          اتوافق {formatDateAr(app.reviewedAt)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>

              <Banner
                tone="accent"
                icon={<FileSignature />}
                title="معرضك مش متعاقد لسه — المزايدة مقفولة"
                action={
                  <Link href="/contract">
                    <Button size="sm">اعرف التفاصيل</Button>
                  </Link>
                }
              >
                الموافقة خلّتك معرض. المزايدة في مزادات CarQ بيفتحها التعاقد، وده قرار تجاري
                منفصل. كل حاجة تانية في البوابة شغالة دلوقتي.
              </Banner>

              <Card>
                <SectionHeader title="جولة سريعة" hint="أنفع تلات خطوات في أول يوم" />
                <ol className="space-y-4">
                  {[
                    {
                      t: 'ارفع مخزونك بالجملة',
                      b: 'ملف CSV واحد بكل العربيات بدل ما تدخّلهم واحدة واحدة.',
                      href: '/inventory/bulk',
                      icon: ClipboardList,
                    },
                    {
                      t: 'ظبّط ملف المعرض',
                      b: 'اللوجو وصور الغلاف وملاحظة التمويل — ده اللي المشتري بيشوفه.',
                      href: '/profile',
                      icon: Store,
                    },
                    {
                      t: 'اقرا شروط المزايدة',
                      b: 'تلات شروط لازم يتحققوا قبل أول مزايدة — وإنت محقق واحد منهم.',
                      href: '/contract',
                      icon: Gavel,
                    },
                  ].map((s, i) => (
                    <li key={s.t} className="flex items-start gap-3">
                      <span className="tnum mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-caption font-extrabold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-title text-content">{s.t}</p>
                        <p className="mt-0.5 text-sub text-content-sub">{s.b}</p>
                      </div>
                      <Link href={s.href} className="shrink-0">
                        <Button variant="outline" size="sm" icon={<s.icon />}>
                          افتح
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          ) : null}

          {/* ═════ مرفوض ═════ */}
          {app && status === 'rejected' ? (
            <>
              <Card className="animate-rise border-crit/30 bg-crit-soft/40">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-crit">
                    <XCircle className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-h2 text-content">الطلب اتّرفض</p>
                    <p className="mt-1.5 text-body text-content">
                      {app.reviewNote ?? 'الطلب ماعدّاش المراجعة.'}
                    </p>
                    <p className="mt-2 text-sub text-content-sub">
                      الرفض مابيلغيش حسابك. إعلاناتك كفرد شغالة زي ما هي، وتقدر تقدّم طلب جديد بعد
                      ٣٠ يوم من تاريخ القرار.
                    </p>
                    {app.reviewedAt ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="neutral" icon={<CalendarClock />}>
                          قرار الرفض {formatDateAr(app.reviewedAt)}
                        </Badge>
                        <Badge tone={reapplyDaysLeft > 0 ? 'warn' : 'ok'} icon={<Hourglass />}>
                          {reapplyDaysLeft > 0
                            ? `تقدر تقدّم تاني بعد ${withThousands(reapplyDaysLeft)} يوم`
                            : 'تقدر تقدّم طلب جديد دلوقتي'}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>

              <Card>
                <SectionHeader
                  title="قبل ما تقدّم تاني"
                  hint="أغلب الرفض بيبقى ورقة مش واضحة أو رقم مش مطابق"
                />
                <ul className="space-y-2.5">
                  {[
                    'اتأكد إن الرقم الضريبي مطابق للي في السجل التجاري بالظبط.',
                    'صوّر الأوراق في نور كويس — الصورة المهزوزة بتتّرفض.',
                    'اتأكد إن السجل التجاري ساري ومش منتهي.',
                    'اسم المعرض في الطلب لازم يكون نفس الاسم في السجل.',
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-2.5 text-sub text-content-sub">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-content-faint" />
                      {tip}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {reapplyAt && reapplyDaysLeft > 0 ? (
                    <p className="text-caption text-content-faint">
                      أقرب ميعاد لطلب جديد: {formatDateAr(reapplyAt)}
                    </p>
                  ) : (
                    <Link href="/apply">
                      <Button icon={<ClipboardList />}>قدّم طلب جديد</Button>
                    </Link>
                  )}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
