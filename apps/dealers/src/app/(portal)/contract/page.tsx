'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileSignature,
  Gavel,
  Phone,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  InkCard,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  formatDateAr,
  secondsUntil,
  withThousands,
} from '@carq/ui';
import { errorMessage, nowMs, useMyEntries, useMyExhibition } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/contract` — حالة التعاقد (EXHIBITION_PORTAL_SPEC §4.7)
 *
 * الصفحة دي بتمنع السؤال اللي بيولّد مكالمة دعم: «ليه المزايدة مقفولة؟»
 *
 * شروط المزايدة تلاتة منفصلة (A-1)، وكل واحد ليه سبب وخطوة جاية
 * مكتوبين. **الإخفاء مش شرح** — والسيرفر هو اللي بيطبّق الشروط في
 * `services/auctions.py::_authorize_bidder`، الواجهة بتوضّح بس.
 * ════════════════════════════════════════════════════════════════
 */

const DAY_SECONDS = 86_400;

type CheckState = 'ok' | 'pending' | 'blocked';

function CheckRow({
  state,
  title,
  body,
  action,
}: {
  state: CheckState;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const icon =
    state === 'ok' ? (
      <CheckCircle2 className="h-5 w-5 text-ok" />
    ) : state === 'pending' ? (
      <CircleDashed className="h-5 w-5 text-warn" />
    ) : (
      <XCircle className="h-5 w-5 text-accent" />
    );
  const border =
    state === 'ok' ? 'border-ok/30' : state === 'pending' ? 'border-warn/30' : 'border-accent/30';

  return (
    <li className={`flex items-start gap-3 rounded-md border ${border} bg-surface px-4 py-3.5`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-title text-content">{title}</p>
        <p className="mt-1 text-sub text-content-sub">{body}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

export default function ContractPage() {
  const exhibition = useMyExhibition();
  const entries = useMyEntries();
  const ex = exhibition.data;

  const paidEntries = (entries.data ?? []).filter((e) => e.paidAt !== null);
  const pendingEntries = (entries.data ?? []).filter((e) => e.paidAt === null);

  /** FND-036 — ثابتة على ساعة الموك المجمّدة عشان أيام العقد المتبقية
   * ما تتغيّرش بصمت بمرور وقت التشغيل الفعلي. */
  const secondsLeft = ex?.contractEndsAt
    ? secondsUntil(ex.contractEndsAt, new Date(nowMs()))
    : null;
  const daysLeft = secondsLeft === null ? null : Math.ceil(secondsLeft / DAY_SECONDS);
  const expired = ex?.contractEndsAt ? secondsLeft === 0 : false;
  const contractLive = Boolean(ex?.isContracted) && !expired;
  const expiringSoon = contractLive && daysLeft !== null && daysLeft <= 30;

  const entriesState: CheckState = paidEntries.length
    ? 'ok'
    : pendingEntries.length
      ? 'pending'
      : 'blocked';

  return (
    <>
      <PageHeader
        title="حالة التعاقد"
        subtitle="يعني إيه متعاقد، وإيه اللي بيفتحه، وإزاي توصله"
        motif="ribbon"
        motifSize={110}
        actions={
          <Link href="/auctions">
            <Button variant="white" size="sm" icon={<Gavel />}>
              المزادات
            </Button>
          </Link>
        }
      />

      <Sheet>
        {exhibition.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-64" />
          </div>
        ) : exhibition.error || !ex ? (
          <Card padded={false}>
            <ErrorState
              message={errorMessage(exhibition.error)}
              onRetry={() => exhibition.refetch()}
            />
          </Card>
        ) : (
          <>
            {/* ───── بطاقة الحالة الكبيرة ───── */}
            {contractLive ? (
              <InkCard className="mb-6 animate-rise">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sub font-bold text-white/70">
                      <ShieldCheck className="h-4 w-4" />
                      حالتك الحالية
                    </p>
                    <p className="mt-2 text-display text-white">متعاقد · العقد ساري</p>
                    <p className="mt-1 text-body text-white/70">
                      المزايدة مفتوحة لك في أي مزاد دفعت رسوم دخوله.
                    </p>
                  </div>
                  <div className="rounded-md bg-white/10 px-5 py-4 text-center">
                    <p className="text-caption text-white/60">متبقي في العقد</p>
                    <p className="tnum mt-1 text-h1 text-white">
                      {daysLeft === null ? '—' : `${withThousands(daysLeft)} يوم`}
                    </p>
                    {ex.contractEndsAt ? (
                      <p className="tnum mt-1 text-caption text-white/60">
                        بينتهي {formatDateAr(ex.contractEndsAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </InkCard>
            ) : (
              <Card
                className={`mb-6 animate-rise ${expired ? 'border-crit/30 bg-crit-soft/40' : 'border-accent/30 bg-accent-soft/40'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sub font-bold text-content-sub">
                      <AlertTriangle className="h-4 w-4" />
                      حالتك الحالية
                    </p>
                    <p className={`mt-2 text-display ${expired ? 'text-crit' : 'text-accent'}`}>
                      {expired ? 'العقد خلص · المزايدة مقفولة' : 'مش متعاقد · المزايدة مقفولة'}
                    </p>
                    <p className="mt-1 text-body text-content-sub">
                      {expired
                        ? `العقد انتهى ${ex.contractEndsAt ? formatDateAr(ex.contractEndsAt) : ''}. معرضك فاضل معرض وإعلاناتك شغالة زي ما هي — المزايدة بس هي اللي وقفت.`
                        : 'معرضك شغال وإعلاناتك بتوصل للمشترين عادي. التعاقد بيفتح حاجة واحدة بس: المزايدة في مزادات CarQ.'}
                    </p>
                  </div>
                  <Button
                    icon={<Phone />}
                    onClick={() =>
                      document
                        .getElementById('how-to-contract')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    اعرف خطوات التعاقد
                  </Button>
                </div>
              </Card>
            )}

            {expiringSoon ? (
              <Banner
                tone="warn"
                icon={<CalendarClock />}
                title={`عقدك بينتهي خلال ${withThousands(daysLeft ?? 0)} يوم`}
                className="mb-6"
              >
                لما التاريخ يعدّي، المزايدة بتقفل لوحدها — من غير ما حد يفتكر يقفل مفتاح بإيده.
                كلّم فريق CarQ للتجديد قبل الميعاد.
              </Banner>
            ) : null}

            {/* ───── الشروط التلاتة ───── */}
            <SectionHeader
              title="شروط المزايدة — تلاتة لازم يتحققوا"
              hint="السيرفر بيتأكد منهم في طبقة الخدمة. الشاشة بتوضّح فين إنت بالظبط."
            />
            <ul className="mb-9 space-y-3">
              <CheckRow
                state="ok"
                title="١. حسابك دوره «معرض»"
                body={`طلبك اتوافق عليه والدور اتغيّر. معرض ${ex.name} · ${ex.area} — ${ex.governorate}.`}
                action={
                  <Link href="/profile">
                    <Button variant="outline" size="sm" icon={<Store />}>
                      الملف
                    </Button>
                  </Link>
                }
              />
              <CheckRow
                state={contractLive ? 'ok' : 'blocked'}
                title="٢. العقد ساري"
                body={
                  contractLive
                    ? `العقد شغال${ex.contractStartsAt ? ` من ${formatDateAr(ex.contractStartsAt)}` : ''}${ex.contractEndsAt ? ` لحد ${formatDateAr(ex.contractEndsAt)}` : ''}.`
                    : 'ده الشرط الوحيد اللي مش متحقق عندك. التعاقد قرار تجاري بين معرضك وCarQ — اقرا الخطوات تحت.'
                }
              />
              <CheckRow
                state={entriesState}
                title="٣. رسوم دخول المزاد متأكّدة"
                body={
                  entriesState === 'ok'
                    ? `${withThousands(paidEntries.length)} دخول متفعّل${pendingEntries.length ? ` · و${withThousands(pendingEntries.length)} لسه مستني تأكيد التحويل` : ''}. الشرط ده بيتحسب لكل مزاد على حدة.`
                    : entriesState === 'pending'
                      ? `${withThousands(pendingEntries.length)} دخول مستني تأكيد التحويل. الدخول بيتفعّل بعد ما الأدمن يأكّد — عادة خلال ساعة عمل.`
                      : 'مسجّلتش دخول في أي مزاد لسه. الدخول بيتسجّل لكل مزاد لوحده، ورسومه بتتأكد قبل ما المزايدة تتفتح.'
                }
                action={
                  <Link href="/billing">
                    <Button variant="outline" size="sm" icon={<Banknote />}>
                      الرسوم
                    </Button>
                  </Link>
                }
              />
            </ul>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* ───── إيه اللي بيفتحه التعاقد ───── */}
              <Card>
                <SectionHeader
                  title="إيه اللي بيفتحه التعاقد"
                  hint="حاجة واحدة بالظبط — والباقي شغال من غيره"
                />
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 rounded-md border border-accent/25 bg-accent-soft/40 px-4 py-3">
                    <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <div>
                      <p className="text-title text-content">المزايدة في مزادات CarQ</p>
                      <p className="mt-1 text-sub text-content-sub">
                        الفيتشر المدفوع الوحيد في المنصة: عربيات بتتعرض للمعارض المتعاقدة بسعر
                        بداية ٨٥٪ من سعر الإعلان، والمزايدة بتقفل على أعلى سعر.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 px-1">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                    <p className="text-sub text-content-sub">
                      <span className="font-bold text-content">الإعلانات والاستفسارات شغالة</span>{' '}
                      من غير تعاقد — عربياتك بتوصل للمشترين عادي.
                    </p>
                  </li>
                  <li className="flex items-start gap-3 px-1">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                    <p className="text-sub text-content-sub">
                      <span className="font-bold text-content">ملف المعرض العام</span> بيفضل ظاهر
                      في التطبيق بكل عربياتك وشارة التوثيق.
                    </p>
                  </li>
                  <li className="flex items-start gap-3 px-1">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                    <p className="text-sub text-content-sub">
                      <span className="font-bold text-content">معرض عقده خلص بيفضل معرض</span> —
                      بياناته وإعلاناته مابتتحذفش، المزايدة بس هي اللي بتقف.
                    </p>
                  </li>
                </ul>
              </Card>

              {/* ───── إزاي تتعاقد ───── */}
              <Card className="scroll-mt-6" as="section">
                <span id="how-to-contract" className="sr-only" />
                <SectionHeader title="إزاي تتعاقد" hint="أربع خطوات — معظمها عندنا مش عندك" />
                <ol className="space-y-4">
                  {[
                    {
                      t: 'اتأكد إن معرضك موثّق',
                      b: 'التوثيق بيتم بعد مراجعة السجل التجاري والبطاقة الضريبية. لو لسه مش موثّق، الفريق هيطلبهم منك.',
                    },
                    {
                      t: 'كلّم فريق حسابات المعارض',
                      b: 'من زرار «اتكلم مع فريق CarQ» فوق، أو من نفس الرقم اللي راجع طلبك. بيتشرح لك المدة والشروط.',
                    },
                    {
                      t: 'توقيع العقد',
                      b: 'العقد بيحدد تاريخ البداية وتاريخ الانتهاء. المدة مش مفتوحة — والتجديد بيتم قبل الانتهاء.',
                    },
                    {
                      t: 'تفعيل المزايدة',
                      b: 'الأدمن بيفعّل التعاقد على حسابك. أول ما يتفعّل، الشرط التاني بيتحقق هنا على طول.',
                    },
                  ].map((s, i) => (
                    <li key={s.t} className="flex items-start gap-3">
                      <span className="tnum mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-caption font-extrabold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-title text-content">{s.t}</p>
                        <p className="mt-0.5 text-sub text-content-sub">{s.b}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            {/* ───── تفاصيل العقد ───── */}
            <Card className="mt-4">
              <SectionHeader title="تفاصيل العقد" hint="نفس القيم اللي السيرفر شايفها" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-caption text-content-sub">الحالة</p>
                  <div className="mt-1.5">
                    <Badge
                      tone={contractLive ? 'ok' : expired ? 'crit' : 'accent'}
                      icon={<FileSignature />}
                    >
                      {contractLive ? 'ساري' : expired ? 'منتهي' : 'مفيش عقد'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-caption text-content-sub">بداية العقد</p>
                  <p className="tnum mt-1.5 text-body text-content">
                    {ex.contractStartsAt ? formatDateAr(ex.contractStartsAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-content-sub">نهاية العقد</p>
                  <p className="tnum mt-1.5 text-body text-content">
                    {ex.contractEndsAt ? formatDateAr(ex.contractEndsAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-content-sub">التوثيق</p>
                  <div className="mt-1.5">
                    <Badge tone={ex.verified ? 'ok' : 'neutral'} icon={<ShieldCheck />}>
                      {ex.verified ? 'موثّق' : 'مش موثّق'}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-caption text-content-faint">
                العقد له تاريخ انتهاء عن قصد: مفتاح «متعاقد» لوحده معناه إن حد لازم يفتكر يقفله
                بإيده يوم ما العقد يخلص. التاريخ + جوب يومي بيقفل لوحده.
              </p>
            </Card>
          </>
        )}
      </Sheet>
    </>
  );
}
