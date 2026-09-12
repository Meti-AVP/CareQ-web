'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  Building2,
  Car,
  EyeOff,
  Gavel,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  ChartFrame,
  chartPalette,
  Funnel,
  HorizontalBars,
  Histogram,
  PageHeader,
  ScatterPlot,
  SectionHeader,
  SegmentedControl,
  Select,
  Sheet,
  StackedShare,
  StatTile,
  status as statusTone,
  TimeSeriesLine,
  axisDayLabel,
  compactEGP,
  safeColor,
  seriesColor,
} from '@carq/ui';
import {
  errorMessage,
  useBreakdown,
  useExhibitions,
  useFunnel,
  useHealth,
  useListings,
  useOverview,
  useTimeseries,
  type StatsFilters,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/` — نظرة عامة (ADMIN_DASHBOARD_SPEC §4.1)
 *
 * ٨ بلاطات + التشارتس C-01 … C-09.
 *
 * بلاطتان منهم **مؤشرات إنذار مش أرقام عادية**:
 *  · «مستنية قرارك» — ناس مستنية فلوس. أحمر لو > 0.
 *  · «إعلانات محبوسة draft» — الإعلان بينشر draft وأول صورة بتفعّله
 *    (D-2)، فعدّاد draft عالي = رفع الصور باظ أو الـworker واقف.
 *    الرقم ده بيكشف عطل بنية تحتية من غير ما حد يبلّغ.
 * ════════════════════════════════════════════════════════════════
 */

const RANGES: Array<{ value: number | 'custom'; label: string }> = [
  { value: 7, label: '٧ أيام' },
  { value: 30, label: '٣٠ يوم' },
  { value: 90, label: '٩٠ يوم' },
  { value: 'custom', label: 'مخصص' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشطة',
  reserved: 'محجوزة',
  sold: 'متباعة',
  expired: 'منتهية',
  removed: 'متشالة',
  rejected: 'مرفوضة',
};

const TAG_LABELS: Record<string, string> = {
  deal: 'لقطة',
  fair: 'سعر عادل',
  high: 'أعلى من السوق',
  unpriced: 'مش متسعّر',
};

export default function OverviewPage() {
  const router = useRouter();

  /* ───── فلاتر §4.1: صف واحد بيتطبّق على الصفحة كلها ───── */
  const [range, setRange] = useState<number | 'custom'>(30);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [gov, setGov] = useState('all');
  const [make, setMake] = useState('all');

  const days = typeof range === 'number' ? range : 30;
  const filters = useMemo<StatsFilters>(
    () => ({
      ...(range === 'custom' && from && to ? { from, to } : {}),
      ...(gov !== 'all' ? { governorate: gov } : {}),
      ...(make !== 'all' ? { make } : {}),
    }),
    [range, from, to, gov, make],
  );

  const overview = useOverview(filters);
  const health = useHealth();
  const published = useTimeseries('listings_published', days, filters);
  const usersTs = useTimeseries('users_created', days, filters);
  const statusBreakdown = useBreakdown('listing_status', filters);
  const tagBreakdown = useBreakdown('price_tag', filters);
  const makeBreakdown = useBreakdown('make', filters);
  const govBreakdown = useBreakdown('governorate', filters);
  const priceBuckets = useBreakdown('price_bucket', filters);
  const publishFunnel = useFunnel('publish', filters);

  /** خيارات الفلاتر من غير فلترة — عشان القايمة ماتضيقش على المختار */
  const govOptions = useBreakdown('governorate');
  const makeOptions = useBreakdown('make');

  /** عيّنة الإعلانات النشطة للتشارت C-09 — من نفس API الجداول */
  const activeSample = useListings({
    status: 'active',
    limit: 200,
    ...(gov !== 'all' ? { governorate: gov } : {}),
    ...(make !== 'all' ? { make } : {}),
  });
  const uncontracted = useExhibitions({ contracted: false });

  const o = overview.data;
  const prev = o?.previous;

  /** سلسلة تراكمية — النمو أوضح كمساحة (C-02) */
  const cumulativeUsers = useMemo(() => {
    let sum = 0;
    return (usersTs.data ?? []).map((p) => {
      sum += p.series.count ?? 0;
      return { label: axisDayLabel(p.t), count: sum };
    });
  }, [usersTs.data]);

  const publishedRows = useMemo(
    () => (published.data ?? []).map((p) => ({ label: axisDayLabel(p.t), count: p.series.count ?? 0 })),
    [published.data],
  );

  const spark = (rows: Array<{ count: number }>) => rows.slice(-12).map((r) => r.count);

  /** C-09: السعر × العداد ملوّن بمؤشر السعر — بيكشف الشواذ */
  // useMemo مش رفاهية هنا: «?? []» بتعمل مصفوفة جديدة كل رندر وتكسر الـmemos اللي تحتها
  const activeRows = useMemo(() => activeSample.data?.items ?? [], [activeSample.data]);
  const scatter = useMemo(
    () =>
      activeRows.slice(0, 150).map((l) => ({
        x: l.km,
        y: l.price,
        group: l.priceTag ? TAG_LABELS[l.priceTag] : TAG_LABELS.unpriced,
        color: l.priceTag
          ? { deal: safeColor(2), fair: safeColor(1), high: safeColor(0) }[l.priceTag]
          : chartPalette.other,
        label: `${l.title} ${l.year}`,
      })),
    [activeRows],
  );

  const overdue = health.data?.overdueAuctions ?? 0;
  const workerDown = health.data ? !health.data.workerAlive : false;

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        subtitle="صحة المنتج في لمحة — والأرقام اللي محتاجة قرار منك النهاردة"
        motif="circle"
      />

      <Sheet>
        {/* ───── صف الفلاتر (§4.1): بيتطبّق على الصفحة كلها مش على رسم واحد ───── */}
        <Card padded={false} className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3">
          <SegmentedControl options={RANGES} value={range} onChange={setRange} size="sm" />
          {range === 'custom' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="من تاريخ"
                className="h-9 rounded-sm border border-line bg-surface-alt px-2.5 text-sub text-content outline-none focus:border-accent"
              />
              <span className="text-caption text-content-faint">إلى</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="إلى تاريخ"
                className="h-9 rounded-sm border border-line bg-surface-alt px-2.5 text-sub text-content outline-none focus:border-accent"
              />
            </div>
          ) : null}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Select
              value={gov}
              onChange={(e) => setGov(e.target.value)}
              aria-label="فلتر المحافظة"
              className="!h-9 w-40 !text-sub"
            >
              <option value="all">كل المحافظات</option>
              {(govOptions.data ?? []).map((b) => (
                <option key={b.key} value={b.key}>
                  {b.key}
                </option>
              ))}
            </Select>
            <Select
              value={make}
              onChange={(e) => setMake(e.target.value)}
              aria-label="فلتر الماركة"
              className="!h-9 w-40 !text-sub"
            >
              <option value="all">كل الماركات</option>
              {(makeOptions.data ?? []).map((b) => (
                <option key={b.key} value={b.key}>
                  {b.key}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        {/* ───── بانر العطل: بيظهر في كل الصفحات لو الـworker واقف (§4.8) ───── */}
        {workerDown || overdue > 0 ? (
          <Banner
            tone="crit"
            icon={<AlertTriangle />}
            title={
              overdue > 0
                ? `${overdue} مزاد متأخر عن القفل — العامل الخلفي واقف`
                : 'العامل الخلفي واقف'
            }
            action={
              <Button variant="danger" size="sm" onClick={() => router.push('/health')}>
                افتح لوحة الصحة
              </Button>
            }
            className="mb-6"
          >
            المزادات مابتتقفلش لوحدها وقت ما `ends_at` يعدّي، وتحليل صور السكان واقف في الطابور.
            كل المؤشرات دي عَرَض لسبب واحد.
          </Banner>
        ) : null}

        {/* ───── بلاطات الـKPI ───── */}
        <SectionHeader
          title="الأرقام الأساسية"
          hint="الدلتا مقارنة بالفترة اللي قبلها مباشرة"
        />
        <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="إعلانات نشطة"
            value={o?.listings.active ?? 0}
            previous={prev?.listings.active}
            spark={spark(publishedRows)}
            icon={<Car />}
            href="/listings?status=active"
            loading={overview.isLoading}
          />
          <StatTile
            label="إعلانات جديدة (٧ أيام)"
            value={publishedRows.slice(-7).reduce((s, r) => s + r.count, 0)}
            icon={<Car />}
            hint="اتنشرت في آخر أسبوع"
            loading={published.isLoading}
          />
          <StatTile
            label="إعلانات محبوسة (مسودة)"
            value={o?.listings.draft ?? 0}
            tone="warn"
            icon={<EyeOff />}
            hint="من غير صور = محدش شايفها. رقم عالي معناه رفع الصور باظ."
            href="/listings?status=draft"
            loading={overview.isLoading}
          />
          <StatTile
            label="مستخدمين جدد (٧ أيام)"
            value={o?.users.new ?? 0}
            previous={prev?.users.new}
            icon={<UserPlus />}
            spark={cumulativeUsers.slice(-12).map((r) => r.count)}
            loading={overview.isLoading}
          />

          <StatTile
            label="مستنية قرارك"
            value={o?.sellNow.pending ?? 0}
            previous={prev?.sellNow.pending}
            alertWhenPositive
            icon={<Zap />}
            hint="طلبات بيع حالًا فوق ١٫٥ مليون — مستنية عرض منك"
            href="/sell-now"
            loading={overview.isLoading}
          />
          <StatTile
            label="طلبات بيع حالًا مفتوحة"
            value={(o?.sellNow.pending ?? 0) + (o?.sellNow.offered ?? 0)}
            previous={(prev?.sellNow.pending ?? 0) + (prev?.sellNow.offered ?? 0)}
            icon={<Zap />}
            href="/sell-now?status=offered"
            loading={overview.isLoading}
          />
          <StatTile
            label="مزادات شغالة"
            value={o?.auctions.live ?? 0}
            icon={<Gavel />}
            tone={overdue > 0 ? 'crit' : 'neutral'}
            hint={overdue > 0 ? `منهم ${overdue} متأخر عن القفل` : undefined}
            href="/auctions?status=live"
            loading={overview.isLoading}
          />
          <StatTile
            label="طلبات تمويل جديدة"
            value={o?.financing.submitted ?? 0}
            previous={prev?.financing.submitted}
            icon={<Banknote />}
            href="/financing"
            loading={overview.isLoading}
          />
        </div>

        {/* ───── الصف الأول: النمو ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-01"
            title="إعلانات منشورة / يوم"
            hint="تغيّر على الوقت — سلسلة واحدة فمفيش legend"
            loading={published.isLoading}
            error={published.isError ? errorMessage(published.error) : undefined}
            onRetry={() => published.refetch()}
            isEmpty={!published.isLoading && publishedRows.every((r) => r.count === 0)}
            tableColumns={[
              { key: 'label', label: 'اليوم' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={publishedRows}
          >
            <TimeSeriesLine
              data={publishedRows}
              series={[{ key: 'count', label: 'إعلانات', color: seriesColor(0) }]}
              unit="إعلان"
            />
          </ChartFrame>

          <ChartFrame
            code="C-02"
            title="مستخدمين جدد — تراكمي"
            hint="النمو التراكمي أوضح كمساحة"
            loading={usersTs.isLoading}
            error={usersTs.isError ? errorMessage(usersTs.error) : undefined}
            onRetry={() => usersTs.refetch()}
            isEmpty={!usersTs.isLoading && cumulativeUsers.length === 0}
            tableColumns={[
              { key: 'label', label: 'اليوم' },
              { key: 'count', label: 'إجمالي' },
            ]}
            tableRows={cumulativeUsers}
          >
            <TimeSeriesLine
              data={cumulativeUsers}
              series={[{ key: 'count', label: 'إجمالي المستخدمين', color: seriesColor(1) }]}
              area
              unit="مستخدم"
            />
          </ChartFrame>
        </div>

        {/* ───── مؤشر السعر العادل + حالات الإعلانات ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-04"
            title="مؤشر السعر العادل"
            hint="شريحة «مش متسعّر» ظاهرة صراحة — إخفاؤها بيخبّي البداية الباردة"
            loading={tagBreakdown.isLoading}
            error={tagBreakdown.isError ? errorMessage(tagBreakdown.error) : undefined}
            onRetry={() => tagBreakdown.refetch()}
            isEmpty={!tagBreakdown.isLoading && (tagBreakdown.data?.length ?? 0) === 0}
            height={120}
            tableColumns={[
              { key: 'label', label: 'المؤشر' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={(tagBreakdown.data ?? []).map((b) => ({
              label: TAG_LABELS[b.key] ?? b.key,
              count: b.count,
            }))}
          >
            <div className="pt-2">
              <StackedShare
                segments={(tagBreakdown.data ?? []).map((b, i) => ({
                  key: b.key,
                  label: TAG_LABELS[b.key] ?? b.key,
                  value: b.count,
                  // «مش متسعّر» رمادي محايد — مش لون سلسلة
                  color: b.key === 'unpriced' ? chartPalette.other : safeColor(i),
                }))}
              />
            </div>
          </ChartFrame>

          <ChartFrame
            code="C-03"
            title="توزيع حالات الإعلانات"
            hint="٧ حالات بأسماء عربية — الشريط الأفقي هو الشكل الصح"
            loading={statusBreakdown.isLoading}
            error={statusBreakdown.isError ? errorMessage(statusBreakdown.error) : undefined}
            onRetry={() => statusBreakdown.refetch()}
            isEmpty={!statusBreakdown.isLoading && (statusBreakdown.data?.length ?? 0) === 0}
            tableColumns={[
              { key: 'label', label: 'الحالة' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={(statusBreakdown.data ?? []).map((b) => ({
              label: STATUS_LABELS[b.key] ?? b.key,
              count: b.count,
            }))}
          >
            <HorizontalBars
              data={(statusBreakdown.data ?? []).map((b) => ({
                label: STATUS_LABELS[b.key] ?? b.key,
                value: b.count,
                // draft بلون حالة — ده مؤشر إنذار مش فئة عادية
                color: b.key === 'draft' ? statusTone.warning : seriesColor(1),
              }))}
              colorKey="color"
              unit="إعلان"
              maxLabelWidth={96}
            />
          </ChartFrame>
        </div>

        {/* ───── القمع + الماركات ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-08"
            title="قمع النشر"
            hint="بيوري بالظبط فين الناس بتقع"
            loading={publishFunnel.isLoading}
            error={publishFunnel.isError ? errorMessage(publishFunnel.error) : undefined}
            onRetry={() => publishFunnel.refetch()}
            isEmpty={!publishFunnel.isLoading && (publishFunnel.data?.steps.length ?? 0) === 0}
            height={300}
            tableColumns={[
              { key: 'label', label: 'الخطوة' },
              { key: 'count', label: 'عدد' },
            ]}
            tableRows={(publishFunnel.data?.steps ?? []).map((s) => ({
              label: s.label,
              count: s.count,
            }))}
          >
            <Funnel
              steps={(publishFunnel.data?.steps ?? []).map((s) => ({
                key: s.key,
                label: s.label,
                count: s.count,
                hint: s.key === 'active' ? 'غالبًا مفيش صور اتحمّلت' : undefined,
              }))}
            />
          </ChartFrame>

          <ChartFrame
            code="C-05"
            title="أعلى ١٠ ماركات"
            loading={makeBreakdown.isLoading}
            error={makeBreakdown.isError ? errorMessage(makeBreakdown.error) : undefined}
            onRetry={() => makeBreakdown.refetch()}
            isEmpty={!makeBreakdown.isLoading && (makeBreakdown.data?.length ?? 0) === 0}
            height={300}
            tableColumns={[
              { key: 'label', label: 'الماركة' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={(makeBreakdown.data ?? []).slice(0, 10).map((b) => ({
              label: b.key,
              count: b.count,
            }))}
          >
            <HorizontalBars
              data={(makeBreakdown.data ?? []).slice(0, 10).map((b) => ({
                label: b.key,
                value: b.count,
              }))}
              height={300}
              unit="إعلان"
              maxLabelWidth={110}
            />
          </ChartFrame>
        </div>

        {/* ───── الجغرافيا + توزيع الأسعار ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-06"
            title="التوزيع الجغرافي"
            loading={govBreakdown.isLoading}
            error={govBreakdown.isError ? errorMessage(govBreakdown.error) : undefined}
            onRetry={() => govBreakdown.refetch()}
            isEmpty={!govBreakdown.isLoading && (govBreakdown.data?.length ?? 0) === 0}
            height={280}
            tableColumns={[
              { key: 'label', label: 'المحافظة' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={(govBreakdown.data ?? []).map((b) => ({ label: b.key, count: b.count }))}
          >
            <HorizontalBars
              data={(govBreakdown.data ?? []).slice(0, 10).map((b) => ({
                label: b.key,
                value: b.count,
              }))}
              height={280}
              unit="إعلان"
              maxLabelWidth={96}
            />
          </ChartFrame>

          <ChartFrame
            code="C-07"
            title="توزيع الأسعار"
            hint="شكل السوق — مش متوسطه"
            loading={priceBuckets.isLoading}
            error={priceBuckets.isError ? errorMessage(priceBuckets.error) : undefined}
            onRetry={() => priceBuckets.refetch()}
            isEmpty={!priceBuckets.isLoading && (priceBuckets.data?.length ?? 0) === 0}
            height={280}
            tableColumns={[
              { key: 'label', label: 'الشريحة' },
              { key: 'count', label: 'إعلانات' },
            ]}
            tableRows={(priceBuckets.data ?? [])
              .slice()
              .sort((a, b) => Number(a.key) - Number(b.key))
              .map((b) => ({ label: compactEGP(Number(b.key)), count: b.count }))}
          >
            <Histogram
              data={(priceBuckets.data ?? [])
                .slice()
                .sort((a, b) => Number(a.key) - Number(b.key))
                .map((b) => ({ label: compactEGP(Number(b.key)), value: b.count }))}
              height={280}
              unit="إعلان"
            />
          </ChartFrame>
        </div>

        {/* ───── الشواذ (C-09) ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4">
          <ChartFrame
            code="C-09"
            title="السعر مقابل العداد"
            hint="بيكشف الشواذ والإعلانات المشبوهة — كل نقطة إعلان نشط"
            height={300}
            loading={activeSample.isLoading}
            error={activeSample.isError ? errorMessage(activeSample.error) : undefined}
            onRetry={() => activeSample.refetch()}
            isEmpty={!activeSample.isLoading && scatter.length === 0}
            series={[
              { key: 'deal', label: 'لقطة', color: safeColor(2) },
              { key: 'fair', label: 'سعر عادل', color: safeColor(1) },
              { key: 'high', label: 'أعلى من السوق', color: safeColor(0) },
              { key: 'unpriced', label: 'مش متسعّر', color: chartPalette.other },
            ]}
            tableColumns={[
              { key: 'label', label: 'الإعلان' },
              { key: 'x', label: 'العداد' },
              { key: 'y', label: 'السعر' },
            ]}
            tableRows={scatter.map((p) => ({ label: p.label ?? '', x: p.x, y: p.y }))}
          >
            <ScatterPlot
              points={scatter}
              height={300}
              xLabel="العداد (كم)"
              yLabel="السعر"
              xFormat={(v) => `${Math.round(v / 1000)} ألف`}
              yFormat={compactEGP}
            />
          </ChartFrame>
        </div>

        {/* ───── تذكير بالفيتشرز الواقفة ───── */}
        <Card className="mt-6 border-accent/25 bg-accent-soft/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-title text-content">قرارات مستنياك</p>
              <p className="mt-1 text-sub text-content-sub">
                {o?.sellNow.pending ?? 0} طلب بيع حالًا مستني عرض ·{' '}
                {uncontracted.data?.total ?? 0} معرض مش متعاقد (مش قادر يزايد)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ink" size="sm" icon={<Zap />} onClick={() => router.push('/sell-now')}>
                طابور بيع حالًا
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Building2 />}
                onClick={() => router.push('/exhibitions')}
              >
                المعارض
              </Button>
            </div>
          </div>
        </Card>
      </Sheet>
    </>
  );
}
