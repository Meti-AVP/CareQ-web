'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  Boxes,
  Car,
  Eye,
  FileSignature,
  Gavel,
  MessagesSquare,
  Plus,
  ShieldCheck,
  Timer,
  TrendingUp,
  Trophy,
  Upload,
} from 'lucide-react';
import {
  Banner,
  Button,
  Card,
  ChartFrame,
  DivergingBars,
  ErrorState,
  HorizontalBars,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  StackedShare,
  StatTile,
  TimeSeriesLine,
  axisDayLabel,
  formatDateAr,
  safeColor,
  seriesColor,
  withThousands,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useExhibitionStats,
  useMyExhibition,
  useMyLeads,
  useMyListings,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/` — لوحة المعرض (EXHIBITION_PORTAL_SPEC §4.1)
 *
 * **بانر الحالة أول حاجة في الصفحة.** التعاقد هو المفتاح اللي بيحيي
 * المزايدة (A-1): من غيره كل شاشات المزاد مقفولة، والمعرض لازم يعرف
 * السبب من أول نظرة — مش لما يضغط «زايد» ويتردّ عليه.
 *
 * التشارتس هنا مش زينة: `D-05` (تسعيري مقابل السوق) هو أنفع رسم
 * للمعرض — بيوريه أنهي عربية مسعّرة فوق السوق وقاعدة من غير حركة.
 * وبيحترم `P-4`: العربية اللي `marketAvg` بتاعها `null` **مستبعدة**
 * من الرسم وعددها مكتوب تحته — مش صفر ومش «في السعر».
 * ════════════════════════════════════════════════════════════════
 */

const DAY_MS = 86_400_000;

/** «أخرى» بتلم المنتهية والمتشالة والمرفوضة — أكتر من ٤ فئات مابتاخدش ألوان زيادة */
const OTHER_STATUSES = ['expired', 'removed', 'rejected'];

export default function DealerHomePage() {
  const router = useRouter();
  const exhibition = useMyExhibition();
  const stats = useExhibitionStats();
  const listings = useMyListings();
  const leads = useMyLeads();

  const s = stats.data;
  const prev = s?.previous;
  const mine = useMemo(() => listings.data ?? [], [listings.data]);

  /**
   * D-01 — مشاهدات عربياتي / يوم.
   * العدّاد اليومي لسه مابيتخزنش في الباك (`views_count` رقم تراكمي بس)،
   * فالسلسلة هنا توزيع متساوي لمشاهدات كل إعلان على أيامه من يوم نشره.
   * الملاحظة تحت الرسم بتقول ده صراحة — الواجهة مابتدّعيش دقة مش عندها.
   */
  const viewsSeries = useMemo(() => {
    const now = nowMs();
    const rows: Array<{ label: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const dayEnd = now - i * DAY_MS;
      let sum = 0;
      for (const l of mine) {
        if (!l.publishedAt || l.viewsCount === 0) continue;
        const published = new Date(l.publishedAt).getTime();
        if (published > dayEnd) continue;
        const liveDays = Math.max(1, Math.round((now - published) / DAY_MS));
        sum += l.viewsCount / liveDays;
      }
      rows.push({ label: axisDayLabel(dayEnd), count: Math.round(sum) });
    }
    return rows;
  }, [mine]);

  /** D-03 — حالة مخزوني. المسودة بلون حالة (تحذير) مش لون فئة. */
  const inventoryMix = useMemo(() => {
    const count = (fn: (status: string) => boolean) => mine.filter((l) => fn(l.status)).length;
    return [
      { key: 'active', label: 'نشطة', value: count((x) => x === 'active'), color: safeColor(2) },
      {
        key: 'draft',
        label: 'مخفية (مسودة)',
        value: count((x) => x === 'draft'),
        color: 'var(--warn)',
      },
      {
        key: 'reserved',
        label: 'محجوزة',
        value: count((x) => x === 'reserved'),
        color: safeColor(1),
      },
      { key: 'sold', label: 'متباعة', value: count((x) => x === 'sold'), color: safeColor(3) },
      {
        key: 'other',
        label: 'أخرى',
        value: count((x) => OTHER_STATUSES.includes(x)),
        color: 'var(--text-sub)',
      },
    ].filter((seg) => seg.value > 0);
  }, [mine]);

  const draftCount = useMemo(() => mine.filter((l) => l.status === 'draft').length, [mine]);

  /** D-05 — تسعيري مقابل السوق. `marketAvg = null` مستبعدة (P-4). */
  const priceVsMarket = useMemo(
    () =>
      mine
        .filter((l) => (l.status === 'active' || l.status === 'reserved') && l.marketAvg !== null)
        .map((l) => ({
          label: `${l.title} ${l.year}`,
          value: ((l.price - l.marketAvg!) / l.marketAvg!) * 100,
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 10),
    [mine],
  );

  const unpricedCount = useMemo(
    () =>
      mine.filter((l) => (l.status === 'active' || l.status === 'reserved') && l.marketAvg === null)
        .length,
    [mine],
  );

  /** D-02 — أعلى ١٠ عربيات مشاهدة */
  const topViewed = useMemo(
    () =>
      [...mine]
        .filter((l) => l.viewsCount > 0)
        .sort((a, b) => b.viewsCount - a.viewsCount)
        .slice(0, 10)
        .map((l) => ({ label: `${l.title} ${l.year}`, value: l.viewsCount })),
    [mine],
  );

  const unreadLeads = useMemo(
    () => (leads.data ?? []).reduce((sum, t) => sum + t.unread, 0),
    [leads.data],
  );

  const ex = exhibition.data;
  const statsError = stats.isError ? errorMessage(stats.error) : undefined;
  const listingsError = listings.isError ? errorMessage(listings.error) : undefined;

  return (
    <>
      <PageHeader
        title="لوحة المعرض"
        subtitle={ex ? `${ex.name} · ${ex.governorate}` : 'مخزونك ومزاداتك وفلوسك في شاشة واحدة'}
        motif="circle"
        actions={
          <>
            <Button
              variant="white"
              size="sm"
              icon={<Plus />}
              onClick={() => router.push('/inventory/new')}
            >
              ضيف عربية
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Upload />}
              onClick={() => router.push('/inventory/bulk')}
              className="!text-white/75 hover:!bg-white/10 hover:!text-white"
            >
              رفع بالجملة
            </Button>
          </>
        }
      />

      <Sheet>
        {/* ───── بانر الحالة: أول حاجة في الصفحة (§4.1) ───── */}
        {exhibition.isLoading ? (
          <Skeleton className="mb-6 h-14 w-full" />
        ) : exhibition.isError ? (
          <Card className="mb-6" padded={false}>
            <ErrorState
              message={errorMessage(exhibition.error)}
              onRetry={() => exhibition.refetch()}
            />
          </Card>
        ) : ex && !ex.isContracted ? (
          <Banner
            tone="accent"
            icon={<FileSignature />}
            title="معرضك مش متعاقد — المزايدة مقفولة"
            action={
              <Button variant="primary" size="sm" onClick={() => router.push('/contract')}>
                اعرف التفاصيل
              </Button>
            }
            className="mb-6"
          >
            تقدر تعرض عربياتك وتستقبل استفسارات عادي، بس دخول المزادات والمزايدة محتاج عقد ساري مع
            CarQ. العقد بيتعمل مرة واحدة وبيفضل شغال لحد تاريخ انتهائه.
          </Banner>
        ) : ex ? (
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ok/25 bg-ok-soft px-4 py-2.5">
            <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-ok" />
            <span className="text-sub font-bold text-ok">متعاقد · العقد ساري</span>
            {ex.contractEndsAt ? (
              <span className="text-caption text-ok/80">
                بينتهي في {formatDateAr(ex.contractEndsAt)}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* ───── بلاطات الـKPI ───── */}
        <SectionHeader
          title="الأرقام الأساسية"
          hint="الدلتا مقارنة بالفترة اللي قبلها مباشرة"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Boxes />}
              onClick={() => router.push('/inventory')}
            >
              افتح المخزون
            </Button>
          }
        />

        {statsError ? (
          <Card className="mb-9" padded={false}>
            <ErrorState message={statsError} onRetry={() => stats.refetch()} />
          </Card>
        ) : stats.isLoading ? (
          <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[108px] w-full" />
            ))}
          </div>
        ) : (
          <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="عربيات معروضة"
              value={s?.listedCars ?? 0}
              previous={prev?.listedCars}
              icon={<Car />}
              href="/inventory"
            />
            <StatTile
              label="إجمالي المشاهدات (٣٠ يوم)"
              value={s?.views30d ?? 0}
              previous={prev?.views30d}
              spark={viewsSeries.slice(-12).map((r) => r.count)}
              icon={<Eye />}
            />
            <StatTile
              label="استفسارات جديدة"
              value={s?.newLeads ?? unreadLeads}
              previous={prev?.newLeads}
              icon={<MessagesSquare />}
              hint="محادثات فيها رسايل لسه ماتقريتش"
              href="/leads"
            />
            <StatTile
              label="مزادات متاحة دلوقتي"
              value={s?.availableAuctions ?? 0}
              icon={<Gavel />}
              tone={ex && !ex.isContracted ? 'warn' : 'neutral'}
              hint={ex && !ex.isContracted ? 'مقفولة عليك لحد ما تتعاقد' : undefined}
              href="/auctions"
            />

            <StatTile
              label="مزادات إنت أعلى مزايد فيها"
              value={s?.highestBidderIn ?? 0}
              tone="ok"
              icon={<Trophy />}
              hint="لسه شغالة — ممكن حد يعلى عليك في أي لحظة"
              href="/auctions/mine"
            />
            <StatTile
              label="مزادات كسبتها (٣٠ يوم)"
              value={s?.wins30d ?? 0}
              previous={prev?.wins30d}
              icon={<Trophy />}
              href="/auctions/mine"
            />
            <StatTile
              label="رسوم مستحقة"
              value={s?.dueFees ?? 0}
              tone={(s?.dueFees ?? 0) > 0 ? 'warn' : 'neutral'}
              icon={<Banknote />}
              hint="رسوم دخول مزادات لسه تحويلها ماتأكدش — الدخول بيفضل مقفول من غيرها"
              href="/billing"
            />
            {s && s.avgDaysToSell !== null ? (
              /* D-06: بلاطة — الاتجاه الزمني (sparkline) محتاج sold_at من الباك */
              <StatTile
                label="متوسط أيام حتى البيع"
                value={s.avgDaysToSell}
                suffix="يوم"
                icon={<Timer />}
                hint="من يوم النشر لحد ما العربية تتعلّم متباعة"
              />
            ) : (
              <Card className="flex flex-col justify-center">
                <p className="text-caption text-content-sub">متوسط أيام حتى البيع</p>
                <p className="mt-2 text-title text-content">لسه مفيش بيعة</p>
                <p className="mt-1 text-caption text-content-faint">
                  الرقم بيظهر بعد أول عربية تتعلّم متباعة.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ───── D-01 · D-03 ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="D-01"
            title="مشاهدات عربياتي / يوم"
            hint="سلسلة واحدة فمفيش legend"
            loading={listings.isLoading}
            error={listingsError}
            isEmpty={!listings.isLoading && viewsSeries.every((r) => r.count === 0)}
            footnote="تقدير: مشاهدات كل إعلان موزّعة بالتساوي على أيامه من يوم النشر. الباك بيخزّن إجمالي تراكمي بس — العدّاد اليومي الدقيق محتاج endpoint مخصص."
            tableColumns={[
              { key: 'label', label: 'اليوم' },
              { key: 'count', label: 'مشاهدات' },
            ]}
            tableRows={viewsSeries}
          >
            <TimeSeriesLine
              data={viewsSeries}
              series={[{ key: 'count', label: 'مشاهدات', color: seriesColor(0) }]}
              area
              unit="مشاهدة"
            />
          </ChartFrame>

          <ChartFrame
            code="D-03"
            title="حالة مخزوني"
            hint="المسودة بلون تحذير — دي عربيات محدش شايفها خالص"
            height={150}
            loading={listings.isLoading}
            error={listingsError}
            isEmpty={!listings.isLoading && inventoryMix.length === 0}
            footnote={
              draftCount > 0
                ? `${withThousands(draftCount)} عربية مخفية دلوقتي — أول صورة هي اللي بتنشرها. «أخرى» = منتهية ومتشالة ومرفوضة.`
                : '«أخرى» = منتهية ومتشالة ومرفوضة.'
            }
            tableColumns={[
              { key: 'label', label: 'الحالة' },
              { key: 'value', label: 'عربيات' },
            ]}
            tableRows={inventoryMix.map((seg) => ({ label: seg.label, value: seg.value }))}
          >
            <div className="pt-2">
              <StackedShare segments={inventoryMix} />
            </div>
          </ChartFrame>
        </div>

        {/* ───── D-05 (أنفع رسم للمعرض) + D-02 ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="D-05"
            title="تسعيري مقابل السوق"
            hint="أعلى ١٠ عربيات فرقها عن متوسط السوق — تيل تحت السوق، برتقالي فوقه"
            height={320}
            loading={listings.isLoading}
            error={listingsError}
            onRetry={() => listings.refetch()}
            isEmpty={!listings.isLoading && priceVsMarket.length === 0}
            footnote={
              unpricedCount > 0
                ? `مستبعد ${withThousands(unpricedCount)} عربية لسه «مش متسعّرة» — محرك التسعير لسه مامعاهوش مقارنات كفاية ليها. متحسبهاش صفر ولا «في السعر».`
                : 'كل عربياتك المعروضة عندها متوسط سوق.'
            }
            tableColumns={[
              { key: 'label', label: 'العربية' },
              { key: 'value', label: 'الفرق ٪' },
            ]}
            tableRows={priceVsMarket.map((r) => ({ label: r.label, value: Math.round(r.value) }))}
          >
            <DivergingBars data={priceVsMarket} height={320} maxLabelWidth={150} />
          </ChartFrame>

          <ChartFrame
            code="D-02"
            title="أداء العربيات"
            hint="أعلى ١٠ عربيات مشاهدة — دي اللي السوق واقف عندها"
            height={320}
            loading={listings.isLoading}
            error={listingsError}
            onRetry={() => listings.refetch()}
            isEmpty={!listings.isLoading && topViewed.length === 0}
            tableColumns={[
              { key: 'label', label: 'العربية' },
              { key: 'value', label: 'مشاهدات' },
            ]}
            tableRows={topViewed}
          >
            <HorizontalBars data={topViewed} height={320} unit="مشاهدة" maxLabelWidth={150} />
          </ChartFrame>
        </div>

        {/* ───── تذكير بالخطوة اللي بعدها ───── */}
        <Card className="mt-6 border-accent/25 bg-accent-soft/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-title text-content">الخطوة اللي بعدها</p>
              <p className="mt-1 text-sub text-content-sub">
                {draftCount > 0 ? `${withThousands(draftCount)} عربية مخفية مستنية أول صورة · ` : ''}
                {unreadLeads > 0 ? `${withThousands(unreadLeads)} رسالة مش متقرية · ` : ''}
                المعرض عنده عربيات كتير؟ الرفع بالجملة بيدخّلهم من ملف واحد.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ink"
                size="sm"
                icon={<Boxes />}
                onClick={() => router.push('/inventory')}
              >
                عربياتي
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<TrendingUp />}
                onClick={() => router.push('/auctions')}
              >
                المزادات المتاحة
              </Button>
            </div>
          </div>
        </Card>
      </Sheet>
    </>
  );
}
