'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Car,
  CheckCircle2,
  CircleSlash,
  Gavel,
  Timer,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  ChartFrame,
  ConfirmDialog,
  Countdown,
  DataTable,
  DivergingBars,
  HorizontalBars,
  PageHeader,
  SectionHeader,
  Sheet,
  StackedShare,
  StatTile,
  Tabs,
  VerticalBars,
  axisDayLabel,
  formatDateTimeAr,
  formatEGP,
  relTimeAr,
  safeColor,
  seriesColor,
  useToast,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useAuctionEntries,
  useAuctions,
  useBreakdown,
  useHealth,
  useMarkEntryPaid,
  useTimeseries,
  type Auction,
  type AuctionEntry,
  type AuctionStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/auctions` — المزادات (ADMIN_DASHBOARD_SPEC §4.5 · C-21 · C-25)
 *
 * الشاشة دي بتراقب الفيتشر المدفوع الوحيد في المنتج، وبتكشف عطلين:
 *
 *  ١) **مزادات متأخرة عن القفل** — `status='live'` و`ends_at` عدّى.
 *     المزاد مابيقفلش لوحده؛ العامل الخلفي هو اللي بيقفله. فلو الرقم
 *     ده أكبر من صفر، مفيش مزاد بيتسوّى ومفيش فايز بيتحدد.
 *
 *  ٢) **رسوم دخول مش مدفوعة** — الشرط التالت من تلاتة للمزايدة (A-1).
 *     كل معرض في الطابور ده مش قادر يزايد دلوقتي.
 * ════════════════════════════════════════════════════════════════
 */

const TABS: Array<{ key: string; label: string }> = [
  { key: 'live', label: 'شغالة' },
  { key: 'overdue', label: 'متأخرة عن القفل' },
  { key: 'settled', label: 'متسوّية' },
  { key: 'failed', label: 'فاشلة' },
  { key: 'defaulted', label: 'متعثرة' },
  { key: 'all', label: 'الكل' },
];

const isOverdue = (a: Auction) => a.status === 'live' && +new Date(a.endsAt) < Date.now();

/** ترتيب حالات C-20 — دورة الحياة */
const AUCTION_ORDER: AuctionStatus[] = ['live', 'settled', 'failed', 'defaulted'];

const STATUS_BADGE: Record<AuctionStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  live: { label: 'شغال', tone: 'accent', icon: <Gavel /> },
  settled: { label: 'متسوّى', tone: 'ok', icon: <CheckCircle2 /> },
  failed: { label: 'قفل من غير مزايدات', tone: 'neutral', icon: <CircleSlash /> },
  defaulted: { label: 'متعثر', tone: 'crit', icon: <AlertTriangle /> },
};

function StatusBadge({ auction }: { auction: Auction }) {
  if (isOverdue(auction))
    return (
      <Badge tone="crit" icon={<AlertTriangle />}>
        متأخر عن القفل
      </Badge>
    );
  const s = STATUS_BADGE[auction.status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

function CarCell({ listing }: { listing: Auction['listing'] }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {listing.imageUrl ? (
        // صور محلية في public/cars — img عادي مش next/image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.imageUrl}
          alt=""
          className="h-10 w-14 shrink-0 rounded-xs object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
          <Car className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sub font-bold text-content">{listing.title}</p>
        <p className="tnum text-caption text-content-faint">
          {listing.year} · {withThousands(listing.km)} كم
        </p>
      </div>
    </div>
  );
}

export default function AuctionsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('live');
  const [payEntry, setPayEntry] = useState<AuctionEntry | null>(null);

  /** الصفحات بالـcursor — بيتصفّر مع تغيير التبويب */
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);

  const list = useAuctions(tab, cursor);
  const all = useAuctions('all');
  const entries = useAuctionEntries();
  const health = useHealth();
  const markPaid = useMarkEntryPaid();

  const rows = list.data?.items ?? [];
  const allRows = useMemo(() => all.data?.items ?? [], [all.data]);
  const overdue = health.data?.overdueAuctions ?? 0;

  /**
   * عدادات التبويبات من نداء «الكل» — الصفحة الأولى. `stats/overview`
   * مابيرجّعش `defaulted` (§6.2أ)، ولما الجدول يعدّي صفحة واحدة لازم
   * العدادات تيجي من الإحصائيات مش من الصفوف.
   */
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: all.data?.total ?? allRows.length,
      overdue: 0,
      live: 0,
      settled: 0,
      failed: 0,
      defaulted: 0,
    };
    for (const a of allRows) {
      c[a.status] = (c[a.status] ?? 0) + 1;
      if (isOverdue(a)) c.overdue += 1;
    }
    return c;
  }, [allRows, all.data?.total]);

  const tabs: TabDef[] = TABS.map((t) => ({
    ...t,
    count: counts[t.key] ?? 0,
    alert: t.key === 'overdue' || t.key === 'defaulted',
  }));

  /* ───── C-21: الارتفاع فوق سعر البداية ───── */
  const finished = useMemo(() => allRows.filter((a) => a.status !== 'live'), [allRows]);
  const rises = useMemo(
    () =>
      finished
        .filter((a) => a.bidsCount > 0)
        .map((a) => ({
          label: `${a.listing.title} ${a.listing.year}`,
          value: ((a.currentBid - a.startPrice) / a.startPrice) * 100,
        }))
        .sort((x, y) => y.value - x.value),
    [finished],
  );
  /** أعلى ١٢ بس في الرسم — الباقي في «عرض كجدول» والتصدير */
  const risen = rises.slice(0, 12);
  const noBids = finished.length - rises.length;

  /* ───── C-20: مزادات كل أسبوع بالحالة — من endpoint السلاسل ───── */
  const createdTs = useTimeseries('auctions_created', 90);
  const weeklyRows = useMemo(() => {
    const pts = createdTs.data ?? [];
    const out: Array<Record<string, string | number>> = [];
    for (let i = 0; i < pts.length; i += 7) {
      const chunk = pts.slice(i, i + 7);
      const row: Record<string, string | number> = {
        label: `أسبوع ${axisDayLabel(chunk[0]!.t)}`,
      };
      AUCTION_ORDER.forEach((s) => {
        row[s] = chunk.reduce((sum, p) => sum + (p.series[s] ?? 0), 0);
      });
      out.push(row);
    }
    return out;
  }, [createdTs.data]);
  const weeklySeries = AUCTION_ORDER.map((s, i) => ({
    key: s,
    label: STATUS_BADGE[s].label,
    color: seriesColor(i),
  }));

  /* ───── C-23: أنشط المعارض بالمزايدات ───── */
  const bidsByEx = useBreakdown('bids_by_exhibition');

  /* ───── C-24: معدل النجاح — رقم واحد ⇒ بلاطة مش رسم ───── */
  const statusBk = useBreakdown('auction_status');
  const settledCount = statusBk.data?.find((b) => b.key === 'settled')?.count ?? 0;
  const failedCount = statusBk.data?.find((b) => b.key === 'failed')?.count ?? 0;
  const successPct =
    settledCount + failedCount > 0
      ? Math.round((settledCount / (settledCount + failedCount)) * 100)
      : 0;
  const settledSpark = weeklyRows.map((r) => Number(r.settled ?? 0));

  /* ───── C-25: رسوم الدخول مدفوع مقابل لأ ───── */
  const entryRows = useMemo(() => entries.data ?? [], [entries.data]);
  const paidCount = entryRows.filter((e) => e.paidAt !== null).length;
  const unpaid = useMemo(() => entryRows.filter((e) => e.paidAt === null), [entryRows]);

  const columns: Array<Column<Auction>> = [
    {
      key: 'car',
      header: 'العربية',
      width: 260,
      value: (a) => a.listing.title,
      render: (a) => <CarCell listing={a.listing} />,
    },
    {
      key: 'leader',
      header: 'المعرض البادئ',
      hideBelow: 'lg',
      // topBid مضمّن في صف المزاد من السيرفر (§6.3) — مفيش N+1 هنا
      value: (a) => a.topBid?.exhibitionName ?? '',
      render: (a) => {
        const top = a.topBid;
        if (!top) return <span className="text-content-faint">لسه مفيش مزايدات</span>;
        return (
          <div className="min-w-0">
            <p className="truncate text-sub text-content">{top.exhibitionName}</p>
            {a.status === 'settled' || a.status === 'defaulted' ? (
              <p className="text-caption text-content-faint">الفايز</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'startPrice',
      header: 'سعر البداية (ج.م)',
      align: 'end',
      sortable: true,
      hideBelow: 'md',
      value: (a) => a.startPrice,
      render: (a) => <span className="tnum text-content-sub">{withThousands(a.startPrice)}</span>,
    },
    {
      key: 'currentBid',
      header: 'أعلى مزايدة (ج.م)',
      align: 'end',
      sortable: true,
      value: (a) => a.currentBid,
      render: (a) => {
        const up = a.startPrice > 0 ? ((a.currentBid - a.startPrice) / a.startPrice) * 100 : 0;
        return (
          <div>
            <span className="tnum font-bold text-content">{withThousands(a.currentBid)}</span>
            {a.bidsCount > 0 ? (
              <p className="tnum text-caption text-content-faint">+{Math.round(up)}٪ فوق البداية</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'reservePrice',
      header: 'السعر المحجوز (ج.م)',
      align: 'end',
      hideBelow: 'xl',
      value: (a) => a.reservePrice ?? 0,
      render: (a) =>
        a.reservePrice === null ? (
          <span className="text-content-faint">من غير حد أدنى</span>
        ) : (
          <span className="tnum text-content-sub">{withThousands(a.reservePrice)}</span>
        ),
    },
    {
      key: 'bidsCount',
      header: 'المزايدات',
      align: 'center',
      sortable: true,
      value: (a) => a.bidsCount,
      render: (a) => <span className="tnum text-content">{withThousands(a.bidsCount)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      value: (a) => (isOverdue(a) ? 'متأخر عن القفل' : STATUS_BADGE[a.status].label),
      render: (a) => <StatusBadge auction={a} />,
    },
    {
      key: 'endsAt',
      header: 'بيقفل في',
      sortable: true,
      value: (a) => +new Date(a.endsAt),
      render: (a) => {
        if (isOverdue(a))
          return (
            <span className="text-sub font-bold text-crit" title={formatDateTimeAr(a.endsAt)}>
              كان لازم يقفل {relTimeAr(a.endsAt)}
            </span>
          );
        if (a.status === 'live') return <Countdown endsAt={a.endsAt} size="sm" />;
        return (
          <span className="text-sub text-content-sub" title={formatDateTimeAr(a.endsAt)}>
            قفل {relTimeAr(a.endsAt)}
          </span>
        );
      },
    },
    {
      key: 'extensionCount',
      header: 'مرات التمديد',
      align: 'center',
      sortable: true,
      hideBelow: 'lg',
      value: (a) => a.extensionCount,
      render: (a) => (
        <span
          className="tnum text-content"
          title="كل مزايدة في آخر دقايق بتمدّ المزاد — ده اللي بيمنع القنص"
        >
          {withThousands(a.extensionCount)}
        </span>
      ),
    },
  ];

  const entryColumns: Array<Column<AuctionEntry>> = [
    {
      key: 'exhibitionName',
      header: 'المعرض',
      value: (e) => e.exhibitionName,
      render: (e) => <span className="text-sub font-bold text-content">{e.exhibitionName}</span>,
    },
    {
      key: 'auctionListingTitle',
      header: 'المزاد',
      value: (e) => e.auctionListingTitle,
      render: (e) => (
        <Link
          href={`/auctions/${e.auctionId}`}
          className="text-sub text-accent transition-colors hover:text-content"
        >
          {e.auctionListingTitle}
        </Link>
      ),
    },
    {
      key: 'fee',
      header: 'الرسوم',
      align: 'end',
      hideBelow: 'md',
      value: (e) => e.fee,
      render: (e) =>
        e.fee > 0 ? (
          <span className="tnum text-content">{formatEGP(e.fee)}</span>
        ) : (
          <span className="text-content-faint">لسه مش متحددة</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'مستني بقاله',
      align: 'center',
      sortable: true,
      hideBelow: 'md',
      value: (e) => +new Date(e.createdAt),
      render: (e) => (
        <span className="text-sub text-content-sub" title={formatDateTimeAr(e.createdAt)}>
          {relTimeAr(e.createdAt)}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'end',
      width: 150,
      value: () => '',
      render: (e) => (
        <Button variant="outline" size="sm" icon={<BadgeCheck />} onClick={() => setPayEntry(e)}>
          أكّد الدفع
        </Button>
      ),
    },
  ];

  const confirmPaid = (reason: string) => {
    if (!payEntry) return;
    const entry = payEntry;
    markPaid.mutate(
      { entryId: entry.id, reason },
      {
        onSuccess: () => {
          toast({
            title: 'اتسجّل الدفع',
            body: `${entry.exhibitionName} بقى يقدر يزايد في المزاد ده`,
            tone: 'ok',
          });
          setPayEntry(null);
        },
        onError: (e) => toast({ title: errorMessage(e), tone: 'crit' }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="المزادات"
        subtitle="مزاد المعارض — الفيتشر المدفوع الوحيد. الشاشة دي بتقول لك هو شغال بجد ولا لأ."
        motif="swoosh"
        actions={
          <Button variant="white" size="sm" icon={<Timer />} onClick={() => router.push('/health')}>
            لوحة الصحة
          </Button>
        }
      >
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(k) => {
            setTab(k);
            setCursor(null);
            setTrail([]);
          }}
          onDark
        />
      </PageHeader>

      <Sheet>
        {/* ───── العطل اللي بيوقف الفيتشر كله ───── */}
        {overdue > 0 ? (
          <Banner
            tone="crit"
            icon={<AlertTriangle />}
            title={`${withThousands(overdue)} مزاد عدّى ميعاد قفله ولسه «شغال»`}
            action={
              <Button variant="danger" size="sm" onClick={() => router.push('/health')}>
                افتح لوحة الصحة
              </Button>
            }
            className="mb-6"
          >
            المزادات مابتقفلش لوحدها — العامل الخلفي هو اللي بيقفلها ويحدد الفايز. وهو واقف
            دلوقتي، فمفيش مزاد بيتسوّى ولا معرض بيعرف إنه كسب.
          </Banner>
        ) : null}

        <SectionHeader
          title="كل المزادات"
          hint="سعر البداية ٨٥٪ من سعر الإعلان · التمديد بيحصل تلقائي مع أي مزايدة في آخر دقايق عشان يمنع القنص"
        />
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(a) => a.id}
          loading={list.isLoading}
          error={list.error ? errorMessage(list.error) : undefined}
          onRetry={() => list.refetch()}
          onRowClick={(a) => router.push(`/auctions/${a.id}`)}
          rowTone={(a) => (isOverdue(a) ? 'crit' : a.status === 'defaulted' ? 'warn' : undefined)}
          searchable
          searchPlaceholder="دوّر بالعربية أو المعرض…"
          exportName="carq-auctions"
          emptyTitle="مفيش مزادات في التبويب ده"
          emptyHint="جرّب تبويب تاني، أو افتح «الكل» عشان تشوف كل المزادات."
          className="mb-9"
          hasMore={Boolean(list.data?.nextCursor)}
          canPrev={trail.length > 0}
          onNext={() => {
            setTrail((t) => [...t, cursor]);
            setCursor(list.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            const prev = trail.length ? (trail[trail.length - 1] ?? null) : null;
            setTrail((t) => t.slice(0, -1));
            setCursor(prev);
          }}
          pageInfo={
            list.data?.total
              ? `${withThousands(trail.length * 25 + 1)} – ${withThousands(trail.length * 25 + rows.length)} من ${withThousands(list.data.total)} مزاد`
              : undefined
          }
        />

        {/* ───── الصورة التجارية ───── */}
        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-21"
            title="الارتفاع فوق سعر البداية"
            hint="قد إيه المزايدة رفعت السعر — من أرقام السيرفر نفسها (البداية وأعلى مزايدة)"
            height={320}
            loading={all.isLoading}
            error={all.error ? errorMessage(all.error) : undefined}
            onRetry={() => all.refetch()}
            isEmpty={!all.isLoading && rises.length === 0}
            footnote={
              noBids > 0
                ? `مستبعد ${withThousands(noBids)} مزاد قفل من غير أي مزايدة — متحسبش صفر`
                : undefined
            }
            tableColumns={[
              { key: 'label', label: 'العربية' },
              { key: 'value', label: 'الارتفاع ٪' },
            ]}
            tableRows={rises.map((r) => ({ label: r.label, value: Math.round(r.value) }))}
          >
            <DivergingBars data={risen} height={320} maxLabelWidth={156} />
          </ChartFrame>

          <div className="flex flex-col gap-4">
            {/* C-24: رقم واحد ⇒ بلاطة مش رسم — والسبارك تطوره أسبوع بأسبوع */}
            <StatTile
              label="معدل نجاح المزادات"
              value={successPct}
              suffix="٪"
              icon={<Gavel />}
              hint={`متسوّي ÷ (متسوّي + فاشل) = ${withThousands(settledCount)} من ${withThousands(
                settledCount + failedCount,
              )} مزاد منتهي`}
              spark={settledSpark}
              tone={successPct < 50 && settledCount + failedCount > 0 ? 'warn' : 'neutral'}
              loading={statusBk.isLoading}
            />

            <ChartFrame
              code="C-25"
              title="رسوم الدخول: مدفوع مقابل لأ"
              hint="الدفع هو الشرط التالت من تلاتة للمزايدة — اللي مش مدفوع معرض واقف"
              height={110}
              loading={entries.isLoading}
              error={entries.error ? errorMessage(entries.error) : undefined}
              onRetry={() => entries.refetch()}
              isEmpty={!entries.isLoading && entryRows.length === 0}
              tableColumns={[
                { key: 'label', label: 'الحالة' },
                { key: 'count', label: 'تسجيلات' },
              ]}
              tableRows={[
                { label: 'مدفوع', count: paidCount },
                { label: 'مش مدفوع', count: unpaid.length },
              ]}
            >
              <div className="pt-2">
                <StackedShare
                  segments={[
                    { key: 'paid', label: 'مدفوع', value: paidCount, color: safeColor(2) },
                    { key: 'unpaid', label: 'مش مدفوع', value: unpaid.length, color: safeColor(0) },
                  ]}
                />
              </div>
            </ChartFrame>
          </div>
        </div>

        <div className="mb-9 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-20"
            title="مزادات اتعملت كل أسبوع — بالحالة"
            hint="أعمدة مكدّسة: الإجمالي وتركيبته في رسم واحد"
            height={280}
            loading={createdTs.isLoading}
            error={createdTs.isError ? errorMessage(createdTs.error) : undefined}
            onRetry={() => createdTs.refetch()}
            isEmpty={
              !createdTs.isLoading &&
              weeklyRows.every((r) => AUCTION_ORDER.every((s) => !Number(r[s] ?? 0)))
            }
            series={weeklySeries}
            tableColumns={[
              { key: 'label', label: 'الأسبوع' },
              ...weeklySeries.map((s) => ({ key: s.key, label: s.label })),
            ]}
            tableRows={weeklyRows}
          >
            <VerticalBars data={weeklyRows} series={weeklySeries} stacked height={280} unit="مزاد" />
          </ChartFrame>

          <ChartFrame
            code="C-23"
            title="أنشط المعارض بالمزايدات"
            hint="مين فعلًا بيلعب في المزادات — أعلى ١٠"
            height={280}
            loading={bidsByEx.isLoading}
            error={bidsByEx.isError ? errorMessage(bidsByEx.error) : undefined}
            onRetry={() => bidsByEx.refetch()}
            isEmpty={!bidsByEx.isLoading && (bidsByEx.data?.length ?? 0) === 0}
            tableColumns={[
              { key: 'label', label: 'المعرض' },
              { key: 'count', label: 'مزايدات' },
            ]}
            tableRows={(bidsByEx.data ?? []).map((b) => ({ label: b.key, count: b.count }))}
          >
            <HorizontalBars
              data={(bidsByEx.data ?? []).slice(0, 10).map((b) => ({
                label: b.key,
                value: b.count,
              }))}
              height={280}
              unit="مزايدة"
              maxLabelWidth={130}
            />
          </ChartFrame>
        </div>

        {/* ───── طابور رسوم الدخول ───── */}
        <SectionHeader
          title="رسوم دخول مستنية تأكيد"
          hint="كل معرض هنا سجّل في مزاد ومادفعش — يعني مش قادر يزايد. الرسوم لسه بصفر في الباك: سياسة الرسوم قرار تجاري لسه مااتاخدش."
        />
        <DataTable
          rows={unpaid}
          columns={entryColumns}
          rowKey={(e) => e.id}
          loading={entries.isLoading}
          error={entries.error ? errorMessage(entries.error) : undefined}
          onRetry={() => entries.refetch()}
          searchable
          searchPlaceholder="دوّر بالمعرض…"
          exportName="carq-unpaid-entries"
          emptyTitle="كل الرسوم متأكدة"
          emptyHint="مفيش معرض واقف بسبب الدفع دلوقتي."
        />

        <ConfirmDialog
          open={payEntry !== null}
          onClose={() => setPayEntry(null)}
          onConfirm={confirmPaid}
          title="تأكيد دفع رسوم الدخول"
          impact={
            payEntry
              ? `ده بيدي «${payEntry.exhibitionName}» حق المزايدة في المزاد ده بفلوس. أكّد بس لما تكون شايف التحويل فعلًا.`
              : ''
          }
          confirmLabel="أكّد الدفع"
          tone="accent"
          reasonLabel="مرجع التحويل أو سببه"
          loading={markPaid.isPending}
        >
          {payEntry ? (
            <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
              <p className="flex items-center gap-2 text-sub text-content">
                <Wallet className="h-4 w-4 shrink-0 text-content-faint" />
                {payEntry.auctionListingTitle}
              </p>
              <p className="mt-1 text-caption text-content-sub">
                سجّل {relTimeAr(payEntry.createdAt)} · الأكشن ده بيتسجّل في سجل التدقيق ومابيتمسحش
              </p>
            </div>
          ) : null}
        </ConfirmDialog>
      </Sheet>
    </>
  );
}
