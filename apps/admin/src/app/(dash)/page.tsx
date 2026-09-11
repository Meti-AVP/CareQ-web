'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Building2,
  Car,
  EyeOff,
  Gavel,
  ShieldCheck,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  ChartFrame,
  chartPalette,
  DivergingBars,
  Funnel,
  HorizontalBars,
  Histogram,
  PageHeader,
  ScatterPlot,
  SectionHeader,
  SegmentedControl,
  Sheet,
  StackedShare,
  StatTile,
  status as statusTone,
  TimeSeriesLine,
  axisDayLabel,
  compactEGP,
  formatPctPlain,
  safeColor,
  seriesColor,
  withThousands,
} from '@carq/ui';
import {
  useBreakdown,
  useFunnel,
  useHealth,
  useOverview,
  useTimeseries,
  mockDb,
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

const RANGES = [
  { value: 7, label: '٧ أيام' },
  { value: 30, label: '٣٠ يوم' },
  { value: 90, label: '٩٠ يوم' },
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
  const [days, setDays] = useState(30);

  const overview = useOverview();
  const health = useHealth();
  const published = useTimeseries('listings_published', days);
  const usersTs = useTimeseries('users_created', days);
  const statusBreakdown = useBreakdown('listing_status');
  const tagBreakdown = useBreakdown('price_tag');
  const makeBreakdown = useBreakdown('make');
  const govBreakdown = useBreakdown('governorate');
  const priceBuckets = useBreakdown('price_bucket');
  const publishFunnel = useFunnel('publish');

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
  const scatter = useMemo(
    () =>
      mockDb.listings
        .filter((l) => l.status === 'active')
        .slice(0, 150)
        .map((l) => ({
          x: l.km,
          y: l.price,
          group: l.priceTag ? TAG_LABELS[l.priceTag] : TAG_LABELS.unpriced,
          color: l.priceTag
            ? { deal: safeColor(2), fair: safeColor(1), high: safeColor(0) }[l.priceTag]
            : chartPalette.other,
          label: `${l.title} ${l.year}`,
        })),
    [],
  );

  /** C-13 مصغّر: فرق سعر الإعلان عن متوسط السوق — اتجاهين حوالين صفر */
  const priceVsMarket = useMemo(
    () =>
      mockDb.listings
        .filter((l) => l.status === 'active' && l.marketAvg !== null)
        .slice(0, 10)
        .map((l) => ({
          label: `${l.title} ${l.year}`,
          value: ((l.price - l.marketAvg!) / l.marketAvg!) * 100,
        })),
    [],
  );
  const unpricedCount = useMemo(
    () => mockDb.listings.filter((l) => l.status === 'active' && l.marketAvg === null).length,
    [],
  );

  const overdue = health.data?.overdueAuctions ?? 0;
  const workerDown = health.data ? !health.data.workerAlive : false;

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        subtitle="صحة المنتج في لمحة — والأرقام اللي محتاجة قرار منك النهاردة"
        motif="circle"
        actions={
          <SegmentedControl
            options={RANGES}
            value={days}
            onChange={setDays}
            className="!bg-white/10 [&_button]:text-white/70 [&_button[aria-selected=true]]:!bg-white [&_button[aria-selected=true]]:!text-ink"
          />
        }
      />

      <Sheet>
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
              <Button variant="danger" size="sm" onClick={() => (window.location.href = '/health')}>
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
          />
          <StatTile
            label="إعلانات جديدة (٧ أيام)"
            value={publishedRows.slice(-7).reduce((s, r) => s + r.count, 0)}
            icon={<Car />}
            hint="اتنشرت في آخر أسبوع"
          />
          <StatTile
            label="إعلانات محبوسة (مسودة)"
            value={o?.listings.draft ?? 0}
            tone="warn"
            icon={<EyeOff />}
            hint="من غير صور = محدش شايفها. رقم عالي معناه رفع الصور باظ."
            href="/listings?status=draft"
          />
          <StatTile
            label="مستخدمين جدد (٧ أيام)"
            value={o?.users.new ?? 0}
            previous={prev?.users.new}
            icon={<UserPlus />}
            spark={cumulativeUsers.slice(-12).map((r) => r.count)}
          />

          <StatTile
            label="مستنية قرارك"
            value={o?.sellNow.pending ?? 0}
            previous={prev?.sellNow.pending}
            alertWhenPositive
            icon={<Zap />}
            hint="طلبات بيع حالًا فوق ١٫٥ مليون — مستنية عرض منك"
            href="/sell-now"
          />
          <StatTile
            label="طلبات بيع حالًا مفتوحة"
            value={(o?.sellNow.pending ?? 0) + (o?.sellNow.offered ?? 0)}
            previous={(prev?.sellNow.pending ?? 0) + (prev?.sellNow.offered ?? 0)}
            icon={<Zap />}
            href="/sell-now?status=offered"
          />
          <StatTile
            label="مزادات شغالة"
            value={o?.auctions.live ?? 0}
            icon={<Gavel />}
            tone={overdue > 0 ? 'crit' : 'neutral'}
            hint={overdue > 0 ? `منهم ${overdue} متأخر عن القفل` : undefined}
            href="/auctions?status=live"
          />
          <StatTile
            label="طلبات تمويل جديدة"
            value={o?.financing.submitted ?? 0}
            previous={prev?.financing.submitted}
            icon={<Banknote />}
            href="/financing"
          />
        </div>

        {/* ───── الصف الأول: النمو ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-01"
            title="إعلانات منشورة / يوم"
            hint="تغيّر على الوقت — سلسلة واحدة فمفيش legend"
            loading={published.isLoading}
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

        {/* ───── الشواذ + الثقة ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-09"
            title="السعر مقابل العداد"
            hint="بيكشف الشواذ والإعلانات المشبوهة — كل نقطة إعلان نشط"
            height={300}
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

          <div className="grid grid-rows-2 gap-4">
            <ChartFrame
              code="C-43"
              title="تغطية الثقة"
              hint="٣ نسب مستقلة — مش شرايح من كل"
              height={120}
              loading={overview.isLoading}
            >
              <div className="space-y-3 pt-1">
                {[
                  { label: 'ممشى موثّق', v: o?.trust.kmVerifiedPct ?? 0, icon: <ShieldCheck /> },
                  { label: 'مفحوص', v: o?.trust.inspectedPct ?? 0, icon: <ShieldCheck /> },
                  { label: 'فيه صور', v: o?.trust.withPhotosPct ?? 0, icon: <Car /> },
                ].map((row, i) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-sub text-content-sub">{row.label}</span>
                      <span className="tnum text-sub font-bold text-content">
                        {formatPctPlain(row.v)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted-soft">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${row.v}%`, backgroundColor: seriesColor(i) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartFrame>

            <ChartFrame
              code="C-13"
              title="السعر مقابل متوسط السوق"
              hint="اتجاهين حوالين صفر — تيل تحت السوق، برتقالي فوقه"
              height={200}
              footnote={`مستبعد ${withThousands(unpricedCount)} إعلان نشط لسه «مش متسعّر» — متحسبش صفر`}
              tableColumns={[
                { key: 'label', label: 'الإعلان' },
                { key: 'value', label: 'الفرق ٪' },
              ]}
              tableRows={priceVsMarket.map((r) => ({
                label: r.label,
                value: Math.round(r.value),
              }))}
            >
              <DivergingBars data={priceVsMarket} height={200} maxLabelWidth={128} />
            </ChartFrame>
          </div>
        </div>

        {/* ───── تذكير بالفيتشرز الواقفة ───── */}
        <Card className="mt-6 border-accent/25 bg-accent-soft/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-title text-content">قرارات مستنياك</p>
              <p className="mt-1 text-sub text-content-sub">
                {o?.sellNow.pending ?? 0} طلب بيع حالًا مستني عرض ·{' '}
                {mockDb.exhibitions.filter((e) => !e.isContracted).length} معرض مش متعاقد (مش قادر
                يزايد)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ink" size="sm" icon={<Zap />} onClick={() => (window.location.href = '/sell-now')}>
                طابور بيع حالًا
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Building2 />}
                onClick={() => (window.location.href = '/exhibitions')}
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
