'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Car,
  CheckCircle2,
  Clock,
  Gavel,
  Hourglass,
  KeyRound,
  RefreshCw,
  ScanLine,
  Tag,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  ChartFrame,
  DataTable,
  ErrorState,
  InkCard,
  PageHeader,
  PulseDot,
  SectionHeader,
  Sheet,
  Skeleton,
  Tabs,
  VerticalBars,
  axisDayLabel,
  formatPctPlain,
  formatTimeAr,
  relTimeAr,
  safeColor,
  waitingFor,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useAdminActivity,
  useHealth,
  useScanJobs,
  useTimeseries,
} from '@carq/api-client';
import type { ScanJob, ScanJobStatus } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/health` — صحة النظام (ADMIN_DASHBOARD_SPEC §4.8)
 *
 * الشاشة دي اتعملت لسبب واحد: **الـworker مش منشور في الإنتاج**،
 * فـ٨ جوبات دورية واقفة والعطل صامت. كل المؤشرات اللي تحت — الطابور،
 * المزادات المتأخرة، العروض المنتهية، الإعلانات اللي عدّت تاريخها —
 * **مش ٨ مشاكل، دي عَرَض واحد**. عشان كده كلهم في كارت واحد اسمه
 * «حالة العامل الخلفي»، وكل رقم معاه جملة بتقول أثره على المستخدم.
 *
 * رقم صامت زي «٧ في الطابور» مابيحرّكش حد. «٧ إعلانات محبوسة مسودة
 * ومحدش شايفها» بتتصلّح.
 *
 * التحديث: الـhook بيعمل poll كل ٣٠ ثانية (§9) — ووقت آخر فحص ظاهر فوق.
 * ════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════ المؤشرات وعتباتها ═══════════════════════ */

type Level = 'ok' | 'warn' | 'crit';

interface Indicator {
  key: string;
  label: string;
  /** القيمة زي ما تتقري — مش رقم خام */
  display: string;
  level: Level;
  badge: string;
  /** الأثر على المستخدم — ده اللي بيخلّي الرقم قرار */
  impact: string;
  icon: ReactNode;
}

const LEVEL_TONE: Record<Level, Tone> = { ok: 'ok', warn: 'warn', crit: 'crit' };

const LEVEL_VALUE_CLASS: Record<Level, string> = {
  ok: 'text-content',
  warn: 'text-warn',
  crit: 'text-crit',
};

function levelIcon(level: Level) {
  if (level === 'crit') return <XCircle />;
  if (level === 'warn') return <AlertTriangle />;
  return <CheckCircle2 />;
}

/** ثواني → «٤٠ دقيقة» / «٣ ساعات» — عمر أقدم مهمة في الطابور */
function durationAr(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} ثانية`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${withThousands(minutes)} دقيقة`;
  const hours = Math.round(minutes / 60);
  return hours <= 10 ? `${hours} ساعات` : `${withThousands(hours)} ساعة`;
}

/* ═══════════════════════ جدول مهام السكان ═══════════════════════ */

const SCAN_STATUS: Record<ScanJobStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  queued: { label: 'في الطابور', tone: 'warn', icon: <Hourglass /> },
  running: { label: 'شغالة', tone: 'accent', icon: <ScanLine /> },
  done: { label: 'خلصت', tone: 'ok', icon: <CheckCircle2 /> },
  failed: { label: 'فشلت', tone: 'crit', icon: <XCircle /> },
};

/** ترتيب ثابت للسلاسل في C-50 — عشان اللون مايتنططش بين التحديثات */
const SERIES_ORDER: ScanJobStatus[] = ['done', 'running', 'queued', 'failed'];

/** أيام C-52 — الفهرس 0 = الأحد (زي `AdminActivityCell.day`) */
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function HealthPage() {
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());
  const [tab, setTab] = useState<ScanJobStatus>('queued');

  /** الصفحات بالـcursor — بيتصفّر مع تغيير التبويب */
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);

  const health = useHealth();
  const scanSeries = useTimeseries('scan_jobs', 14);
  /** التلات استعلامات دايمًا شغالة — عدادات التبويبات من `total` بتاعها */
  const queuedJobs = useScanJobs('queued');
  const failedJobs = useScanJobs('failed');
  const doneJobs = useScanJobs('done');
  /** جدول التبويب الحالي بيتبع الـcursor */
  const paged = useScanJobs(tab, cursor);

  const h = health.data;

  /* ───── المؤشرات الثمانية — كلها أعراض لسبب واحد ───── */
  const indicators = useMemo<Indicator[]>(() => {
    if (!h) return [];
    return [
      {
        key: 'queued',
        label: 'مهام سكان في الطابور',
        display: `${withThousands(h.queuedScans)} مهمة`,
        level: h.queuedScans > 5 ? 'warn' : 'ok',
        badge: h.queuedScans > 5 ? 'فوق العتبة (٥)' : 'تحت العتبة',
        impact:
          'المهمة دي هي اللي بتقرا صور العربية وتملا المواصفات. طول ما هي في الطابور، الإعلان بيفضل مسودة ومحدش شايفه في البحث.',
        icon: <ScanLine />,
      },
      {
        key: 'oldest',
        label: 'عمر أقدم مهمة في الطابور',
        display: h.queuedScans === 0 ? 'مفيش طابور' : durationAr(h.oldestQueuedScanSeconds),
        level: h.oldestQueuedScanSeconds > 300 ? 'crit' : 'ok',
        badge: h.oldestQueuedScanSeconds > 300 ? 'العامل واقف' : 'الإيقاع طبيعي',
        impact:
          'ده المؤشر الحاسم مش عدد المهام: فوق ٥ دقايق معناها إن العامل مش بطيء — العامل واقف أصلًا وماحدش بيسحب من الطابور.',
        icon: <Hourglass />,
      },
      {
        key: 'failed',
        label: 'مهام فشلت في ٢٤ ساعة',
        display: `${withThousands(h.failedScans24h)} مهمة`,
        level: h.failedScans24h > 0 ? 'warn' : 'ok',
        badge: h.failedScans24h > 0 ? 'محتاجة مراجعة' : 'مفيش فشل',
        impact:
          'كل مهمة فشلت = بائع اتسابه يكتب المواصفات بإيده أو يسيب الإعلان ناقص. راجع سبب الفشل في الجدول تحت — المتكرر بيبقى مشكلة تخزين مش مشكلة صورة.',
        icon: <AlertTriangle />,
      },
      {
        key: 'overdue',
        label: 'مزادات متأخرة عن القفل',
        display: `${withThousands(h.overdueAuctions)} مزاد`,
        level: h.overdueAuctions > 0 ? 'crit' : 'ok',
        badge: h.overdueAuctions > 0 ? 'حرج' : 'كله متقفل في وقته',
        impact:
          'المزادات مش بتتقفل لوحدها بعد ما ينتهي وقتها — الفايز مابيتحددش، والمعرض اللي كسب مابيتبلّغش، والبايع مستني نتيجة مش جاية.',
        icon: <Gavel />,
      },
      {
        key: 'sell-now',
        label: 'عروض بيع حالًا منتهية ومش متقفلة',
        display: `${withThousands(h.expiredSellNowOffers)} عرض`,
        level: h.expiredSellNowOffers > 0 ? 'crit' : 'ok',
        badge: h.expiredSellNowOffers > 0 ? 'حرج' : 'مفيش عروض معلّقة',
        impact:
          'صلاحية العرض ٢٤ ساعة، ولما تعدّي المفروض يتقفل تلقائي. لأنه ماتقفلش، البائع لسه شايف عرض منتهي ويقدر يضغط «أقبل» على سعر مش ساري.',
        icon: <Zap />,
      },
      {
        key: 'expired-listings',
        label: 'إعلانات منتهية ولسه نشطة',
        display: `${withThousands(h.expiredActiveListings)} إعلان`,
        level: h.expiredActiveListings > 0 ? 'warn' : 'ok',
        badge: h.expiredActiveListings > 0 ? 'ظاهرة في البحث' : 'مفيش إعلان منتهي',
        impact:
          'إعلانات عدّت تاريخ انتهائها ولسه بتظهر للمشترين. النتيجة محادثات على عربيات اتباعت من زمان — وده اللي بيخلّي الناس تبطّل تثق في نتايج البحث.',
        icon: <Car />,
      },
      {
        key: 'unpriced',
        label: 'نسبة الإعلانات المش متسعّرة',
        display: formatPctPlain(h.unpricedActivePct),
        level: h.unpricedActivePct >= 30 ? 'warn' : 'ok',
        badge: h.unpricedActivePct >= 30 ? 'تغطية ضعيفة' : 'تغطية مقبولة',
        impact:
          'الإعلانات دي مالهاش متوسط سوق، يعني مفيش مؤشر سعر عادل عليها. فوق ٣٠٪ معناها إن جوب التسعير مش بيلحق يشتغل — مش إن السوق مافيهوش مقارنات.',
        icon: <Tag />,
      },
      {
        key: 'idempotency',
        label: 'مفاتيح idempotency قديمة',
        display: `${withThousands(h.idempotencyKeys)} مفتاح`,
        level: 'warn',
        badge: 'بتكبر ومابتتنضفش',
        impact:
          'المفاتيح دي المفروض جوب دوري ينضّفها. رقم بيكبر ومابينزلش أبدًا معناه إن جوب التنضيف واقف هو كمان — والجدول هيفضل يتخن لحد ما يبوّظ أداء الكتابة.',
        icon: <KeyRound />,
      },
    ];
  }, [h]);

  const critCount = indicators.filter((i) => i.level === 'crit').length;
  const warnCount = indicators.filter((i) => i.level === 'warn').length;
  const workerDown = h ? !h.workerAlive : false;

  /* ───── C-50: مهام السكان بالحالة على الوقت ───── */
  const scanRows = useMemo(
    () =>
      (scanSeries.data ?? []).map((p) => {
        const row: Record<string, string | number> = { label: axisDayLabel(p.t) };
        SERIES_ORDER.forEach((s) => {
          row[s] = p.series[s] ?? 0;
        });
        return row;
      }),
    [scanSeries.data],
  );

  /** السلاسل اللي فيها بيانات فعلًا — مفيش legend لسلسلة كلها أصفار */
  const scanSeriesDefs = useMemo(
    () =>
      SERIES_ORDER.filter((s) => scanRows.some((r) => Number(r[s] ?? 0) > 0)).map((s, i) => ({
        key: s,
        label: SCAN_STATUS[s].label,
        // ألوان قابلة للمقارنة المباشرة (مكدّس) — النواة الرباعية
        color: safeColor(i),
      })),
    [scanRows],
  );

  const scanTotal = scanRows.reduce(
    (sum, r) => sum + SERIES_ORDER.reduce((s, k) => s + Number(r[k] ?? 0), 0),
    0,
  );

  /* ───── C-52: نشاط الأدمن يوم × ساعة (بتوقيت القاهرة) ───── */
  const activity = useAdminActivity();
  const activityGrid = useMemo(() => {
    const m = new Map<string, number>();
    (activity.data ?? []).forEach((c) => m.set(`${c.day}:${c.hour}`, c.count));
    return m;
  }, [activity.data]);
  const maxActivity = useMemo(
    () => Math.max(1, ...(activity.data ?? []).map((c) => c.count)),
    [activity.data],
  );
  const activityTable = useMemo(
    () =>
      [...(activity.data ?? [])]
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map((c) => ({
          label: `${DAYS_AR[c.day]} ${String(c.hour).padStart(2, '0')}:00`,
          count: c.count,
        })),
    [activity.data],
  );

  /* ───── جدول المهام ───── */
  const active = paged;

  const tabs: TabDef[] = [
    {
      key: 'queued',
      label: 'في الطابور',
      count: queuedJobs.data?.total ?? 0,
      alert: (queuedJobs.data?.total ?? 0) > 5,
    },
    {
      key: 'failed',
      label: 'فشلت',
      count: failedJobs.data?.total ?? 0,
      alert: (failedJobs.data?.total ?? 0) > 0,
    },
    { key: 'done', label: 'خلصت', count: doneJobs.data?.total ?? 0 },
  ];

  const columns: Array<Column<ScanJob>> = [
    {
      key: 'listingTitle',
      header: 'العربية',
      value: (r) => r.listingTitle,
      render: (r) => (
        <Link
          href={`/listings/${r.listingId}`}
          className="font-bold text-content transition-colors hover:text-accent"
        >
          {r.listingTitle}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      width: 130,
      value: (r) => SCAN_STATUS[r.status].label,
      render: (r) => (
        <Badge tone={SCAN_STATUS[r.status].tone} icon={SCAN_STATUS[r.status].icon}>
          {SCAN_STATUS[r.status].label}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'اتسجّلت',
      width: 150,
      sortable: true,
      value: (r) => r.createdAt,
      render: (r) => (
        <span className="text-content-sub" title={formatTimeAr(r.createdAt)}>
          {relTimeAr(r.createdAt, now)}
        </span>
      ),
    },
    {
      key: 'waiting',
      header: 'مستنية بقالها',
      width: 120,
      align: 'center',
      hideBelow: 'md',
      value: (r) => (r.status === 'queued' ? waitingFor(r.createdAt, now) : '—'),
      render: (r) =>
        r.status === 'queued' ? (
          <span className="tnum font-bold text-warn">{waitingFor(r.createdAt, now)}</span>
        ) : (
          <span className="text-content-faint">—</span>
        ),
    },
    {
      key: 'error',
      header: 'سبب الفشل',
      value: (r) => r.error ?? '—',
      hideBelow: 'lg',
      render: (r) =>
        r.error ? (
          <span className="text-crit">{r.error}</span>
        ) : r.finishedAt ? (
          <span className="text-content-faint">خلصت {relTimeAr(r.finishedAt, now)}</span>
        ) : (
          <span className="text-content-faint">لسه ماتنفذتش</span>
        ),
    },
  ];

  const emptyFor: Record<ScanJobStatus, { title: string; hint: string }> = {
    queued: {
      title: 'الطابور فاضي',
      hint: 'مفيش مهمة سكان مستنية — يعني العامل الخلفي بيسحب المهام أول بأول.',
    },
    failed: {
      title: 'مفيش مهام فشلت',
      hint: 'كل مهام تحليل الصور عدّت من غير أخطاء.',
    },
    done: {
      title: 'مفيش مهام خلصت لسه',
      hint: 'أول ما مهمة تتنفذ هتبان هنا بوقت تنفيذها.',
    },
    running: { title: 'مفيش مهام شغالة', hint: '' },
  };

  return (
    <>
      <PageHeader
        title="صحة النظام"
        subtitle="كل المؤشرات هنا أعراض لسبب واحد — العامل الخلفي. اقراها مع بعض مش كل واحد لوحده."
        motif="circle"
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden text-end sm:block">
              <p className="text-caption text-white/50">آخر فحص</p>
              <p className="text-sub font-bold text-white">
                {h ? formatTimeAr(h.checkedAt) : '—'}
              </p>
            </div>
            <Button
              variant="white"
              size="sm"
              icon={<RefreshCw />}
              loading={health.isFetching}
              onClick={() => {
                void health.refetch();
                void queuedJobs.refetch();
                void failedJobs.refetch();
                void doneJobs.refetch();
              }}
            >
              افحص دلوقتي
            </Button>
          </div>
        }
      />

      <Sheet>
        {/* ───────── الكارت الكبير: العامل الخلفي ───────── */}
        {health.isLoading ? (
          <Skeleton className="mb-6 h-[188px] w-full rounded-lg" />
        ) : health.isError ? (
          <Card className="mb-6">
            <ErrorState message={errorMessage(health.error)} onRetry={() => void health.refetch()} />
          </Card>
        ) : (
          <InkCard className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 max-w-2xl">
                <div className="inline-flex items-center gap-2.5 rounded-full bg-white/10 px-3 py-1.5">
                  <PulseDot tone={workerDown ? 'crit' : 'ok'} />
                  <span className="text-caption font-bold text-white">
                    {workerDown ? 'متوقف' : 'بيرد'}
                  </span>
                </div>

                <h2 className="mt-2 text-h1 text-white">
                  {workerDown ? 'العامل الخلفي واقف' : 'العامل الخلفي شغال'}
                </h2>

                <p className="mt-2 text-body text-white/70">
                  {workerDown
                    ? 'الـworker مش منشور في الإنتاج دلوقتي، يعني ٨ جوبات دورية مش بتشتغل خالص. ده مش بطء مؤقت بيصلّح نفسه: المزادات مش بتتقفل، العروض مش بتنتهي، وصور السكان بتستنى في الطابور لحد ما حد ينشر الـworker.'
                    : 'العامل بيسحب من الطابور في وقته. المؤشرات تحت بتفضل مرصودة كل ٣٠ ثانية عشان أول ما يقف يبان فورًا مش بعد ما المستخدمين يشتكوا.'}
                </p>

                <p className="mt-3 text-sub text-white/45">
                  أقدم مهمة في الطابور عمرها{' '}
                  <span className="tnum font-bold text-white/70">
                    {h && h.queuedScans > 0 ? durationAr(h.oldestQueuedScanSeconds) : 'مفيش'}
                  </span>{' '}
                  · العتبة ٥ دقايق
                </p>
              </div>

              <div className="flex shrink-0 gap-3">
                <div className="rounded-md bg-crit-soft px-5 py-4 text-center">
                  <p className="tnum text-h1 leading-none text-crit">{withThousands(critCount)}</p>
                  <p className="mt-2 text-caption font-bold text-crit opacity-75">مؤشر حرج</p>
                </div>
                <div className="rounded-md bg-warn-soft px-5 py-4 text-center">
                  <p className="tnum text-h1 leading-none text-warn">{withThousands(warnCount)}</p>
                  <p className="mt-2 text-caption font-bold text-warn opacity-75">مؤشر تحذيري</p>
                </div>
              </div>
            </div>
          </InkCard>
        )}

        {/* ───────── كارت واحد بكل المؤشرات ───────── */}
        <SectionHeader
          title="حالة العامل الخلفي"
          hint="٨ مؤشرات، سبب واحد. جنب كل رقم الأثر اللي المستخدم بيشوفه فعلًا."
        />

        <Card className="mb-9" padded={false}>
          {health.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : health.isError ? (
            <ErrorState message={errorMessage(health.error)} onRetry={() => void health.refetch()} />
          ) : (
            <ul>
              {indicators.map((ind) => (
                <li
                  key={ind.key}
                  className="flex flex-col gap-3 border-b border-line p-5 last:border-0 sm:flex-row sm:items-start"
                >
                  <span
                    className={[
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full [&>svg]:h-[18px] [&>svg]:w-[18px]',
                      ind.level === 'crit'
                        ? 'bg-crit-soft text-crit'
                        : ind.level === 'warn'
                          ? 'bg-warn-soft text-warn'
                          : 'bg-ok-soft text-ok',
                    ].join(' ')}
                  >
                    {ind.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-title text-content">{ind.label}</span>
                      <Badge tone={LEVEL_TONE[ind.level]} icon={levelIcon(ind.level)}>
                        {ind.badge}
                      </Badge>
                    </div>
                    <p className="mt-1.5 max-w-3xl text-sub text-content-sub">{ind.impact}</p>
                  </div>

                  <span
                    className={`tnum shrink-0 text-h2 sm:w-36 sm:text-end ${LEVEL_VALUE_CLASS[ind.level]}`}
                  >
                    {ind.display}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ───────── C-50 ───────── */}
        <div className="mb-9">
          <ChartFrame
            code="C-50"
            title="مهام السكان بالحالة"
            hint="آخر ١٤ يوم — الشريط المكدّس بيوري تركيب المهام مش عددها بس"
            height={280}
            loading={scanSeries.isLoading}
            error={scanSeries.isError ? errorMessage(scanSeries.error) : undefined}
            onRetry={() => scanSeries.refetch()}
            isEmpty={!scanSeries.isLoading && !scanSeries.isError && scanTotal === 0}
            series={scanSeriesDefs}
            footnote="عمود فيه شريحة «في الطابور» متراكمة على أيام ورا بعض معناه إن الطابور مابيتفضّيش — مش إن الضغط زاد."
            tableColumns={[
              { key: 'label', label: 'اليوم' },
              ...scanSeriesDefs.map((s) => ({ key: s.key, label: s.label })),
            ]}
            tableRows={scanRows}
          >
            <VerticalBars
              data={scanRows}
              series={scanSeriesDefs}
              height={280}
              stacked
              unit="مهمة"
            />
          </ChartFrame>
        </div>

        {/* ───────── C-52: نشاط الأدمن ───────── */}
        <div className="mb-9">
          <ChartFrame
            code="C-52"
            title="نشاط الأدمن — يوم × ساعة"
            hint="من سجل التدقيق بتوقيت القاهرة — الخلية الأغمق = أكشنات أكتر"
            height={240}
            loading={activity.isLoading}
            error={activity.isError ? errorMessage(activity.error) : undefined}
            onRetry={() => activity.refetch()}
            isEmpty={!activity.isLoading && (activity.data?.length ?? 0) === 0}
            footnote="بيقول إمتى الفريق فعلًا بيشتغل — مفيد لجدولة الصيانة بعيد عن ساعات الذروة"
            tableColumns={[
              { key: 'label', label: 'اليوم والساعة' },
              { key: 'count', label: 'أكشنات' },
            ]}
            tableRows={activityTable}
          >
            <div className="overflow-x-auto pt-2">
              <div className="min-w-[620px]">
                {/* صف الساعات */}
                <div className="mb-1 grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-[3px]">
                  <span />
                  {Array.from({ length: 24 }, (_, hr) => (
                    <span key={hr} className="tnum text-center text-[10px] text-content-faint">
                      {hr % 6 === 0 ? hr : ''}
                    </span>
                  ))}
                </div>
                {DAYS_AR.map((day, di) => (
                  <div
                    key={day}
                    className="mb-[3px] grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-[3px]"
                  >
                    <span className="self-center text-caption text-content-sub">{day}</span>
                    {Array.from({ length: 24 }, (_, hr) => {
                      const count = activityGrid.get(`${di}:${hr}`) ?? 0;
                      return (
                        <span
                          key={hr}
                          className="relative h-5 overflow-hidden rounded-[3px] bg-muted-soft"
                          title={`${day} ${String(hr).padStart(2, '0')}:00 — ${withThousands(count)} أكشن`}
                        >
                          {count > 0 ? (
                            <span
                              className="absolute inset-0 bg-accent"
                              style={{ opacity: 0.2 + 0.8 * (count / maxActivity) }}
                            />
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </ChartFrame>
        </div>

        {/* ───────── جدول مهام السكان ───────── */}
        <SectionHeader
          title="مهام السكان"
          hint="المهمة دي بتقرا صور العربية وتملا المواصفات — وقوفها بيحبس الإعلان في المسودة"
        />

        <div className="mb-4">
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as ScanJobStatus);
              setCursor(null);
              setTrail([]);
            }}
          />
        </div>

        <DataTable<ScanJob>
          caption="جدول مهام فحص الصحة"
          rows={active.data?.items ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          loading={active.isLoading}
          error={active.isError ? errorMessage(active.error) : undefined}
          onRetry={() => void active.refetch()}
          emptyTitle={emptyFor[tab].title}
          emptyHint={emptyFor[tab].hint}
          rowTone={(r) => (r.status === 'failed' ? 'crit' : r.status === 'queued' ? 'warn' : undefined)}
          searchable
          searchPlaceholder="دوّر باسم العربية أو سبب الفشل…"
          exportName={`scan-jobs-${tab}`}
          hasMore={Boolean(active.data?.nextCursor)}
          canPrev={trail.length > 0}
          onNext={() => {
            setTrail((t) => [...t, cursor]);
            setCursor(active.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            const prev = trail.length ? (trail[trail.length - 1] ?? null) : null;
            setTrail((t) => t.slice(0, -1));
            setCursor(prev);
          }}
          pageInfo={
            active.data?.total
              ? `${withThousands(trail.length * 25 + 1)} – ${withThousands(trail.length * 25 + (active.data?.items.length ?? 0))} من ${withThousands(active.data.total)} مهمة`
              : undefined
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-content-faint">
          <span className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            الجدول بيعرض ٢٥ مهمة في الصفحة — قلّب بالأزرار تحت
          </span>
          <span className="flex items-center gap-2">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            الصفحة بتفحص لوحدها كل ٣٠ ثانية
          </span>
          <span className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            آخر فحص {h ? `${formatTimeAr(h.checkedAt)} · ${relTimeAr(h.checkedAt, now)}` : '—'}
          </span>
        </div>
      </Sheet>
    </>
  );
}
