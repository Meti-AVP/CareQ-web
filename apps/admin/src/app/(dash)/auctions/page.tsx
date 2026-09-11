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
  PageHeader,
  SectionHeader,
  Sheet,
  StackedShare,
  Tabs,
  chartPalette,
  formatDateTimeAr,
  formatEGP,
  relTimeAr,
  safeColor,
  useToast,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  mockDb,
  useAuctionEntries,
  useAuctions,
  useHealth,
  useMarkEntryPaid,
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

/** سعر البداية = ٨٥٪ من سعر الإعلان (A-2) */
const START_RATIO = 0.85;
/** عرض «بيع حالًا» = ٩١٪ من سعر الإعلان (SN-1) */
const SELL_NOW_RATIO = 0.91;
/**
 * الخط اللي بيجاوب على السؤال التجاري: المزاد لازم يرتفع بالنسبة دي
 * فوق سعر البداية عشان يعدّي عرض «بيع حالًا» على نفس العربية.
 */
const BREAK_EVEN_PCT = (SELL_NOW_RATIO / START_RATIO - 1) * 100;

const TABS: Array<{ key: string; label: string }> = [
  { key: 'live', label: 'شغالة' },
  { key: 'overdue', label: 'متأخرة عن القفل' },
  { key: 'settled', label: 'متسوّية' },
  { key: 'failed', label: 'فاشلة' },
  { key: 'defaulted', label: 'متعثرة' },
  { key: 'all', label: 'الكل' },
];

const isOverdue = (a: Auction) => a.status === 'live' && +new Date(a.endsAt) < Date.now();

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

  const list = useAuctions(tab);
  const all = useAuctions('all');
  const entries = useAuctionEntries();
  const health = useHealth();
  const markPaid = useMarkEntryPaid();

  const rows = list.data?.items ?? [];
  const allRows = useMemo(() => all.data?.items ?? [], [all.data]);
  const overdue = health.data?.overdueAuctions ?? 0;

  /**
   * المعرض البادئ. قايمة المزادات في الباك مابترجعش أعلى مزايد (§6.3) —
   * فبنجمّعه من طبقة الموك لحد ما الرد يضمّه، بدل ما نعمل نداء لكل صف
   * (N+1 على الجدول كله).
   */
  const topBidder = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }>();
    for (const b of mockDb.bids) {
      const cur = map.get(b.auctionId);
      if (!cur || b.amount > cur.amount)
        map.set(b.auctionId, { name: b.exhibitionName, amount: b.amount });
    }
    return map;
  }, []);

  /**
   * عدادات التبويبات من نداء «الكل» — الصفحة الأولى. `stats/overview`
   * مابيرجّعش `defaulted` (§6.2أ)، ولما الجدول يعدّي صفحة واحدة لازم
   * العدادات تيجي من الإحصائيات مش من الصفوف.
   */
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: allRows.length,
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
  }, [allRows]);

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
  const beatSellNow = rises.filter((r) => r.value >= BREAK_EVEN_PCT).length;
  const noBids = finished.length - rises.length;

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
      value: (a) => topBidder.get(a.id)?.name ?? '',
      render: (a) => {
        const top = topBidder.get(a.id);
        if (!top) return <span className="text-content-faint">لسه مفيش مزايدات</span>;
        return (
          <div className="min-w-0">
            <p className="truncate text-sub text-content">{top.name}</p>
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
        <Tabs tabs={tabs} value={tab} onChange={setTab} onDark />
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
        />

        {/* ───── الصورة التجارية ───── */}
        <div className="mb-9 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-21"
            title="الارتفاع فوق سعر البداية"
            hint={`السؤال التجاري: المزاد بيعدّي عرض «بيع حالًا» ولا لأ؟ الخط ده عند +${Math.round(
              BREAK_EVEN_PCT,
            )}٪ فوق سعر البداية`}
            height={320}
            loading={all.isLoading}
            error={all.error ? errorMessage(all.error) : undefined}
            isEmpty={!all.isLoading && rises.length === 0}
            footnote={`${withThousands(beatSellNow)} من ${withThousands(
              rises.length,
            )} مزاد منتهي عدّى الـ٩١٪ بتاعة بيع حالًا${
              noBids > 0 ? ` · مستبعد ${withThousands(noBids)} مزاد قفل من غير أي مزايدة` : ''
            }`}
            tableColumns={[
              { key: 'label', label: 'العربية' },
              { key: 'value', label: 'الارتفاع ٪' },
            ]}
            tableRows={rises.map((r) => ({ label: r.label, value: Math.round(r.value) }))}
          >
            <DivergingBars data={risen} height={320} maxLabelWidth={156} />
          </ChartFrame>

          <div className="flex flex-col gap-4">
            <ChartFrame
              code="C-25"
              title="رسوم الدخول: مدفوع مقابل لأ"
              hint="الدفع هو الشرط التالت من تلاتة للمزايدة — اللي مش مدفوع معرض واقف"
              height={110}
              loading={entries.isLoading}
              error={entries.error ? errorMessage(entries.error) : undefined}
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

            <ChartFrame
              code="C-20"
              title="المزادات بالحالة"
              hint="تركيبة الطابور دلوقتي — المتأخر عن القفل لسه محسوب جوه «شغالة»"
              height={110}
              loading={all.isLoading}
              isEmpty={!all.isLoading && allRows.length === 0}
              tableColumns={[
                { key: 'label', label: 'الحالة' },
                { key: 'count', label: 'مزادات' },
              ]}
              tableRows={TABS.filter((t) => t.key !== 'all' && t.key !== 'overdue').map((t) => ({
                label: t.label,
                count: counts[t.key] ?? 0,
              }))}
            >
              <div className="pt-2">
                <StackedShare
                  segments={[
                    { key: 'live', label: 'شغالة', value: counts.live ?? 0, color: safeColor(1) },
                    {
                      key: 'settled',
                      label: 'متسوّية',
                      value: counts.settled ?? 0,
                      color: safeColor(2),
                    },
                    {
                      key: 'failed',
                      label: 'فاشلة',
                      value: counts.failed ?? 0,
                      color: chartPalette.other,
                    },
                    {
                      key: 'defaulted',
                      label: 'متعثرة',
                      value: counts.defaulted ?? 0,
                      color: safeColor(3),
                    },
                  ]}
                />
              </div>
            </ChartFrame>
          </div>
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
