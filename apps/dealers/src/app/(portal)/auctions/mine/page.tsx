'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Clock3,
  Crown,
  Gavel,
  Lock,
  Trophy,
} from 'lucide-react';
import {
  Badge,
  Card,
  ChartFrame,
  Countdown,
  DataTable,
  HorizontalBars,
  PageHeader,
  SectionHeader,
  Sheet,
  Tabs,
  VerticalBars,
  formatDateAr,
  formatEGP,
  formatKm,
  formatPctPlain,
  secondsUntil,
  seriesColor,
  withThousands,
  type Column,
  type TabDef,
} from '@carq/ui';
import {
  errorMessage,
  useDealerAuctions,
  useMyBids,
  useMyEntries,
  useMyExhibition,
  type Auction,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/auctions/mine` — مزاداتي (EXHIBITION_PORTAL_SPEC §3 · §7)
 *
 * ٣ تبويبات لأنها **٣ أسئلة مختلفة**:
 *  · داخل فيها  — دفعت رسوم دخول ولا لسه؟ (الشرط ٣ من ٣، A-1)
 *  · مزايد فيها — فلوسي معلّقة فين دلوقتي؟
 *  · كسبتها     — المزادات اللي `winner_bid_id` بتاعها مزايدة من مزايداتي
 *
 * الرسمين: `D-11` مزايداتي مقابل مكاسبي · `D-12` متوسط الارتفاع فوق البداية.
 * ════════════════════════════════════════════════════════════════
 */

const STATUS_LABEL: Record<string, string> = {
  live: 'شغال',
  settled: 'اتسوّى',
  failed: 'فشل — مفيش مزايدات',
  defaulted: 'متعثر',
};

const STATUS_TONE: Record<string, 'ok' | 'neutral' | 'warn' | 'crit'> = {
  live: 'ok',
  settled: 'neutral',
  failed: 'warn',
  defaulted: 'crit',
};

/** «أغسطس 2026» — من نفس فورماتر التاريخ بتوقيت القاهرة */
function monthLabel(d: Date): string {
  return formatDateAr(d).replace(/^\d+\s/, '');
}

export default function MyAuctionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('entered');

  // كل الحالات مطلوبة هنا — مش الشغالة بس (§8.3 بند ٤)
  const auctionsQ = useDealerAuctions('all');
  const myBidsQ = useMyBids();
  const entriesQ = useMyEntries();
  const exhibitionQ = useMyExhibition();

  const auctions = useMemo(() => auctionsQ.data ?? [], [auctionsQ.data]);
  const myBids = useMemo(() => myBidsQ.data ?? [], [myBidsQ.data]);
  const entries = useMemo(() => entriesQ.data ?? [], [entriesQ.data]);

  const entryByAuction = useMemo(() => {
    const map = new Map<string, (typeof entries)[number]>();
    for (const e of entries) map.set(e.auctionId, e);
    return map;
  }, [entries]);

  /** أعلى مزايدة ليّا في كل مزاد + مجموعة مُعرّفات مزايداتي */
  const myTopByAuction = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of myBids) {
      const cur = map.get(b.auctionId) ?? 0;
      if (b.amount > cur) map.set(b.auctionId, b.amount);
    }
    return map;
  }, [myBids]);

  const myBidIds = useMemo(() => new Set(myBids.map((b) => b.id)), [myBids]);

  const entered = useMemo(
    () => auctions.filter((a) => entryByAuction.has(a.id) || a.myEntry !== null),
    [auctions, entryByAuction],
  );
  const bidding = useMemo(
    () => auctions.filter((a) => myTopByAuction.has(a.id)),
    [auctions, myTopByAuction],
  );
  /** الكسب بيتحدد بـ`winnerBidId` بتاع السيرفر — مش بمقارنة أرقام في الفرونت */
  const won = useMemo(
    () => auctions.filter((a) => a.winnerBidId !== null && myBidIds.has(a.winnerBidId)),
    [auctions, myBidIds],
  );

  const tabs: TabDef[] = [
    { key: 'entered', label: 'داخل فيها', count: entered.length },
    { key: 'bidding', label: 'مزايد فيها', count: bidding.length },
    { key: 'won', label: 'كسبتها', count: won.length },
  ];

  const rows = tab === 'entered' ? entered : tab === 'bidding' ? bidding : won;

  const outcome = (a: Auction) => {
    const mine = myTopByAuction.get(a.id) ?? 0;
    if (a.winnerBidId && myBidIds.has(a.winnerBidId))
      return (
        <Badge tone="ok" icon={<Trophy />}>
          كسبتها
        </Badge>
      );
    if (mine === 0)
      return (
        <Badge tone="neutral" icon={<Gavel />}>
          مازايدتش
        </Badge>
      );
    if (a.status === 'live' && mine === a.currentBid)
      return (
        <Badge tone="ok" icon={<Crown />}>
          إنت الأعلى
        </Badge>
      );
    if (a.status === 'live')
      return (
        <Badge tone="crit" icon={<AlertTriangle />}>
          اتخطّيت
        </Badge>
      );
    return (
      <Badge tone="neutral" icon={<Lock />}>
        خسرتها
      </Badge>
    );
  };

  const columns: Array<Column<Auction>> = [
    {
      key: 'car',
      header: 'العربية',
      width: 250,
      value: (a) => a.listing.title,
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted-soft">
            {a.listing.imageUrl ? (
              // الصور محلية في public/cars — img عادي مش next/image
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.listing.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Car className="h-5 w-5 text-content-faint" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sub font-bold text-content">{a.listing.title}</span>
            <span className="block text-caption text-content-faint">
              {a.listing.year} · {formatKm(a.listing.km)} · {a.listing.governorate}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'حالة المزاد',
      align: 'center',
      value: (a) => STATUS_LABEL[a.status] ?? a.status,
      render: (a) => (
        <Badge tone={STATUS_TONE[a.status] ?? 'neutral'} icon={<Gavel />}>
          {STATUS_LABEL[a.status] ?? a.status}
        </Badge>
      ),
    },
    {
      key: 'entry',
      header: 'دخولي',
      align: 'center',
      hideBelow: 'md',
      value: (a) => {
        const e = entryByAuction.get(a.id);
        return !e ? 0 : e.paidAt ? 2 : 1;
      },
      render: (a) => {
        const e = entryByAuction.get(a.id);
        const paid = e ? e.paidAt !== null : Boolean(a.myEntry?.paid);
        if (!e && !a.myEntry)
          return (
            <Badge tone="crit" icon={<Lock />}>
              مش مسجّل
            </Badge>
          );
        return paid ? (
          <Badge tone="ok" icon={<CheckCircle2 />}>
            متأكّد
          </Badge>
        ) : (
          <Badge tone="warn" icon={<Clock3 />}>
            مستني التأكيد
          </Badge>
        );
      },
    },
    {
      key: 'myBid',
      header: 'أعلى مزايدة ليك',
      align: 'end',
      sortable: true,
      value: (a) => myTopByAuction.get(a.id) ?? 0,
      render: (a) => {
        const mine = myTopByAuction.get(a.id) ?? 0;
        return mine > 0 ? (
          <span className="tnum font-bold text-accent">{formatEGP(mine)}</span>
        ) : (
          <span className="text-caption text-content-faint">—</span>
        );
      },
    },
    {
      key: 'currentBid',
      header: 'المزايدة الحالية',
      align: 'end',
      sortable: true,
      value: (a) => a.currentBid,
      render: (a) => <span className="tnum font-bold text-content">{formatEGP(a.currentBid)}</span>,
    },
    {
      key: 'outcome',
      header: 'النتيجة',
      align: 'center',
      value: (a) => (a.winnerBidId && myBidIds.has(a.winnerBidId) ? 2 : a.status === 'live' ? 1 : 0),
      render: (a) => outcome(a),
    },
    {
      key: 'endsAt',
      header: 'الوقت',
      align: 'end',
      sortable: true,
      value: (a) => new Date(a.endsAt).getTime(),
      render: (a) =>
        a.status === 'live' && secondsUntil(a.endsAt) > 0 ? (
          <Countdown endsAt={a.endsAt} size="sm" />
        ) : (
          <span className="text-caption text-content-sub">{formatDateAr(a.endsAt)}</span>
        ),
    },
  ];

  /* ─────────── D-11: مزايداتي مقابل مكاسبي — آخر ٦ شهور ─────────── */
  const d11 = useMemo(() => {
    const months: Array<{ key: string; label: string; bids: number; wins: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: monthLabel(d),
        bids: 0,
        wins: 0,
      });
    }
    const indexOf = (iso: string) => {
      const d = new Date(iso);
      return months.findIndex((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
    };
    for (const b of myBids) {
      const i = indexOf(b.createdAt);
      if (i >= 0) months[i]!.bids += 1;
    }
    for (const a of won) {
      const winning = myBids.find((b) => b.id === a.winnerBidId);
      const i = indexOf(winning?.createdAt ?? a.endsAt);
      if (i >= 0) months[i]!.wins += 1;
    }
    return months.map((m) => ({ label: m.label, bids: m.bids, wins: m.wins }));
  }, [myBids, won]);

  /* ─────────── D-12: الارتفاع فوق سعر البداية ─────────── */
  const d12 = useMemo(() => {
    const pool = entered.length > 0 ? entered : bidding;
    return pool
      .filter((a) => a.startPrice > 0 && a.bidsCount > 0)
      .map((a) => ({
        label: a.listing.title,
        value: Math.round(((a.currentBid - a.startPrice) / a.startPrice) * 1000) / 10,
      }))
      .sort((x, y) => y.value - x.value)
      .slice(0, 10);
  }, [entered, bidding]);

  const d12Average = d12.length ? d12.reduce((s, r) => s + r.value, 0) / d12.length : 0;

  const loading = auctionsQ.isLoading || myBidsQ.isLoading || entriesQ.isLoading;
  // فشل أي من التلات نداءات بيتقال — «دخلت؟ دفعت؟» جاي من entries تحديدًا
  const error = auctionsQ.isError
    ? errorMessage(auctionsQ.error)
    : myBidsQ.isError
      ? errorMessage(myBidsQ.error)
      : entriesQ.isError
        ? errorMessage(entriesQ.error)
        : undefined;

  const unpaidCount = entries.filter((e) => e.paidAt === null).length;

  return (
    <>
      <PageHeader
        title="مزاداتي"
        subtitle={
          exhibitionQ.data
            ? `${exhibitionQ.data.name} — كل مزاد دخلته أو زايدت فيه أو كسبته`
            : 'كل مزاد دخلته أو زايدت فيه أو كسبته'
        }
        motif="oval"
      >
        <Tabs tabs={tabs} value={tab} onChange={setTab} onDark />
      </PageHeader>

      <Sheet>
        {unpaidCount > 0 ? (
          <Card className="mb-6 border-warn/25 bg-warn-soft">
            <p className="flex items-center gap-2 text-title text-warn">
              <Clock3 className="h-5 w-5" />
              {withThousands(unpaidCount)} دخول مستني تأكيد التحويل
            </p>
            <p className="mt-1 text-sub text-warn opacity-90">
              المزايدة في المزادات دي مقفولة لحد ما CarQ تأكّد التحويل — ارفع الإيصال من صفحة الرسوم
              والفواتير.
            </p>
          </Card>
        ) : null}

        <DataTable
          caption="جدول مزايداتي"
          rows={rows}
          columns={columns}
          rowKey={(a) => a.id}
          loading={loading}
          error={error}
          onRetry={() => {
            void auctionsQ.refetch();
            void myBidsQ.refetch();
            void entriesQ.refetch();
          }}
          emptyTitle={
            tab === 'entered'
              ? 'مادخلتش أي مزاد لسه'
              : tab === 'bidding'
                ? 'مازايدتش في أي مزاد'
                : 'مفيش مزادات كسبتها لسه'
          }
          emptyHint={
            tab === 'won'
              ? 'الكسب بيتحدد من السيرفر لما المزاد يقفل ويتسوّى.'
              : 'افتح صفحة المزادات المتاحة واختار عربية تناسب مخزونك.'
          }
          onRowClick={(a) => router.push(`/auctions/${a.id}`)}
          searchable
          searchPlaceholder="دوّر بالعربية…"
          exportName="carq-my-auctions"
        />

        <SectionHeader
          title="أداء مزاداتي"
          hint="المزايدة مش هدف في نفسها — المهم نسبة الكسب وسعر القفل"
          className="mt-9"
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="D-11"
            title="مزايداتي مقابل مكاسبي"
            hint="عدد المزايدات جنب عدد المزادات المكسوبة في نفس الشهر"
            series={[
              { key: 'bids', label: 'مزايدات', color: seriesColor(0) },
              { key: 'wins', label: 'مكاسب', color: seriesColor(1) },
            ]}
            loading={myBidsQ.isLoading}
            isEmpty={!myBidsQ.isLoading && d11.every((r) => r.bids === 0 && r.wins === 0)}
            height={280}
            tableColumns={[
              { key: 'label', label: 'الشهر' },
              { key: 'bids', label: 'مزايدات' },
              { key: 'wins', label: 'مكاسب' },
            ]}
            tableRows={d11}
          >
            <VerticalBars
              data={d11}
              series={[
                { key: 'bids', label: 'مزايدات', color: seriesColor(0) },
                { key: 'wins', label: 'مكاسب', color: seriesColor(1) },
              ]}
              height={280}
              unit="مزاد"
            />
          </ChartFrame>

          <ChartFrame
            code="D-12"
            title="الارتفاع فوق سعر البداية"
            hint="كل عربية: المزايدة الحالية مقارنة بسعر البداية (85٪ من سعر الإعلان)"
            loading={loading}
            isEmpty={!loading && d12.length === 0}
            height={280}
            footnote={
              d12.length
                ? `المتوسط ${formatPctPlain(d12Average)} فوق سعر البداية · ${withThousands(d12.length)} مزاد`
                : undefined
            }
            tableColumns={[
              { key: 'label', label: 'العربية' },
              { key: 'value', label: 'الارتفاع ٪' },
            ]}
            tableRows={d12}
          >
            <HorizontalBars data={d12} height={280} unit="٪" maxLabelWidth={140} />
          </ChartFrame>
        </div>
      </Sheet>
    </>
  );
}
