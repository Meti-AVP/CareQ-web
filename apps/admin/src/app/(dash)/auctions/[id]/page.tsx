'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Car,
  CheckCircle2,
  CircleSlash,
  Gauge,
  Gavel,
  MapPin,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChartFrame,
  ConfirmDialog,
  Countdown,
  DataTable,
  ErrorState,
  PageHeader,
  PulseDot,
  SectionHeader,
  Sheet,
  Skeleton,
  SparseValues,
  TimeSeriesLine,
  formatDateTimeAr,
  formatEGP,
  formatTimeAr,
  relTimeAr,
  seriesColor,
  useToast,
  withThousands,
  type Column,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useAuction,
  useAuctionBids,
  useAuctionEntries,
  useMarkDefaulted,
  useMarkEntryPaid,
  type Auction,
  type AuctionBid,
  type AuctionEntry,
  type AuctionStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/auctions/[id]` — مزاد واحد (ADMIN_DASHBOARD_SPEC §4.5 · C-22)
 *
 * تلات حاجات الشاشة دي بتجاوب عليها:
 *  ١) المزاد وصل لكام، وامتى بيقفل (عداد من `ends_at` بتاع السيرفر).
 *  ٢) مين زايد وبكام — الاسم **علني جوه المزاد بالتصميم** (A-12)،
 *     من غير تليفونات.
 *  ٣) مين دافع رسوم الدخول ومين لأ — ده الشرط التالت للمزايدة (A-1).
 *
 * «تعليم متعثر» بيشتغل بس على مزاد `settled` (A-11). في أي حالة تانية
 * الزرار مقفول **ومعاه سبب مكتوب** — بدل ما نسيب الأدمن ياخد
 * `AUCTION_NOT_SETTLED` في وشه.
 * ════════════════════════════════════════════════════════════════
 */

/** عرض «بيع حالًا» = ٩١٪ من سعر الإعلان (SN-1) */
const SELL_NOW_RATIO = 0.91;

const STATUS_BADGE: Record<AuctionStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  live: { label: 'شغال', tone: 'accent', icon: <Gavel /> },
  settled: { label: 'متسوّى', tone: 'ok', icon: <CheckCircle2 /> },
  failed: { label: 'قفل من غير مزايدات', tone: 'neutral', icon: <CircleSlash /> },
  defaulted: { label: 'متعثر', tone: 'crit', icon: <AlertTriangle /> },
};

/** ليه زرار «تعليم متعثر» مقفول — الرسالة دي بتظهر قبل الخطأ مش بعده */
function whyDefaultBlocked(a: Auction): string | null {
  if (a.status === 'settled') return null;
  if (a.status === 'live')
    return 'المزاد لسه شغال. «متعثر» معناها إن الفايز مايكملش — ومفيش فايز لحد ما المزاد يتسوّى.';
  if (a.status === 'failed')
    return 'المزاد قفل من غير مزايدات، فمفيش فايز أصلًا يتعلّم متعثر.';
  return 'المزاد متعلّم متعثر بالفعل — والأكشن ده مابيتكررش.';
}

function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'crit';
}) {
  return (
    <div>
      <p className="text-caption text-content-sub">{label}</p>
      <p
        className={
          tone === 'accent'
            ? 'tnum mt-0.5 text-h2 text-accent'
            : tone === 'crit'
              ? 'tnum mt-0.5 text-h2 text-crit'
              : 'tnum mt-0.5 text-h2 text-content'
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-caption text-content-faint">{hint}</p> : null}
    </div>
  );
}

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const toast = useToast();

  const auction = useAuction(id);
  const bids = useAuctionBids(id);
  const entries = useAuctionEntries(id);
  const markDefaulted = useMarkDefaulted();
  const markPaid = useMarkEntryPaid();

  const [defaultOpen, setDefaultOpen] = useState(false);
  const [payEntry, setPayEntry] = useState<AuctionEntry | null>(null);

  const a = auction.data;
  const bidRows = useMemo(() => bids.data ?? [], [bids.data]);
  const entryRows = useMemo(() => entries.data ?? [], [entries.data]);

  const overdue = a ? a.status === 'live' && +new Date(a.endsAt) < Date.now() : false;
  const blocked = a ? whyDefaultBlocked(a) : 'استنى لحد ما بيانات المزاد تحمّل.';

  /** C-22: المزايدة قفزات مش تدرّج — خط درجي من البداية لآخر مزايدة */
  const curve = useMemo(() => {
    if (!a) return [];
    const asc = [...bidRows].sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));
    return [
      { label: 'سعر البداية', amount: a.startPrice },
      ...asc.map((b) => ({ label: formatTimeAr(b.createdAt), amount: b.amount })),
    ];
  }, [a, bidRows]);

  const sellNowEquivalent = a ? Math.round((a.listing.price * SELL_NOW_RATIO) / 1000) * 1000 : 0;
  const beatsSellNow = a ? a.currentBid >= sellNowEquivalent : false;
  const risePct = a && a.startPrice > 0 ? ((a.currentBid - a.startPrice) / a.startPrice) * 100 : 0;
  const paidCount = entryRows.filter((e) => e.paidAt !== null).length;

  const bidColumns: Array<Column<AuctionBid>> = [
    {
      key: 'exhibitionName',
      header: 'المعرض',
      value: (b) => b.exhibitionName,
      render: (b) => (
        <div className="flex items-center gap-2">
          <span className="text-sub font-bold text-content">{b.exhibitionName}</span>
          {b.id === bidRows[0]?.id ? (
            <Badge tone="accent" icon={<Gavel />}>
              الأعلى
            </Badge>
          ) : null}
          {a?.winnerBidId === b.id ? (
            <Badge tone="ok" icon={<CheckCircle2 />}>
              الفايز
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'المبلغ (ج.م)',
      align: 'end',
      sortable: true,
      value: (b) => b.amount,
      render: (b) => <span className="tnum font-bold text-content">{withThousands(b.amount)}</span>,
    },
    {
      key: 'overStart',
      header: 'فوق البداية',
      align: 'end',
      hideBelow: 'md',
      value: (b) => (a && a.startPrice > 0 ? Math.round(((b.amount - a.startPrice) / a.startPrice) * 100) : 0),
      render: (b) => (
        <span className="tnum text-content-sub">
          +{a && a.startPrice > 0 ? Math.round(((b.amount - a.startPrice) / a.startPrice) * 100) : 0}٪
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'الوقت',
      align: 'end',
      sortable: true,
      value: (b) => +new Date(b.createdAt),
      render: (b) => (
        <span className="text-sub text-content-sub" title={formatDateTimeAr(b.createdAt)}>
          {formatDateTimeAr(b.createdAt)}
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
      key: 'paid',
      header: 'رسوم الدخول',
      value: (e) => (e.paidAt ? 'مدفوع' : 'مش مدفوع'),
      render: (e) =>
        e.paidAt ? (
          <Badge tone="ok" icon={<CheckCircle2 />}>
            مدفوع
          </Badge>
        ) : (
          <Badge tone="warn" icon={<ShieldAlert />}>
            مش مدفوع — مش قادر يزايد
          </Badge>
        ),
    },
    {
      key: 'when',
      header: 'التاريخ',
      hideBelow: 'md',
      value: (e) => +new Date(e.paidAt ?? e.createdAt),
      render: (e) => (
        <span
          className="text-sub text-content-sub"
          title={formatDateTimeAr(e.paidAt ?? e.createdAt)}
        >
          {e.paidAt ? `دفع ${relTimeAr(e.paidAt)}` : `سجّل ${relTimeAr(e.createdAt)}`}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'end',
      width: 150,
      value: () => '',
      render: (e) =>
        e.paidAt ? (
          <span className="text-caption text-content-faint">تم</span>
        ) : (
          <Button variant="outline" size="sm" icon={<BadgeCheck />} onClick={() => setPayEntry(e)}>
            أكّد الدفع
          </Button>
        ),
    },
  ];

  const confirmDefault = (reason: string) => {
    markDefaulted.mutate(
      { id, reason },
      {
        onSuccess: () => {
          toast({
            title: 'المزاد اتعلّم متعثر',
            body: 'الأكشن اتسجّل في سجل التدقيق',
            tone: 'ok',
          });
          setDefaultOpen(false);
        },
        onError: (e) => toast({ title: errorMessage(e), tone: 'crit' }),
      },
    );
  };

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
        title={a ? a.listing.title : 'المزاد'}
        subtitle={
          a
            ? `مزاد معارض · بدأ من ${formatEGP(a.startPrice)} · ${withThousands(a.bidsCount)} مزايدة`
            : 'بيحمّل بيانات المزاد…'
        }
        motif="underline"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<Gavel />}
              className="!text-white/70 hover:!bg-white/10 hover:!text-white"
              onClick={() => router.push('/auctions')}
            >
              كل المزادات
            </Button>
            <span title={blocked ?? 'الفايز مايكملش الصفقة'} className="inline-flex">
              <Button
                variant="danger"
                size="sm"
                icon={<ShieldAlert />}
                disabled={Boolean(blocked)}
                onClick={() => setDefaultOpen(true)}
              >
                تعليم متعثر
              </Button>
            </span>
          </>
        }
      />

      <Sheet>
        {auction.error ? (
          <ErrorState message={errorMessage(auction.error)} onRetry={() => auction.refetch()} />
        ) : auction.isLoading || !a ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Skeleton className="h-52 xl:col-span-2" />
            <Skeleton className="h-52" />
          </div>
        ) : (
          <>
            {overdue ? (
              <Banner
                tone="crit"
                icon={<AlertTriangle />}
                title="المزاد ده عدّى ميعاد قفله ولسه مفتوح"
                action={
                  <Button variant="danger" size="sm" onClick={() => router.push('/health')}>
                    لوحة الصحة
                  </Button>
                }
                className="mb-6"
              >
                العامل الخلفي هو اللي بيقفل المزاد ويحدد الفايز. وهو واقف، فالمزايدات ممكن تفضل
                داخلة على مزاد المفروض قفل من {relTimeAr(a.endsAt)}.
              </Banner>
            ) : null}

            {blocked && a.status === 'defaulted' ? (
              <Banner
                tone="warn"
                icon={<ShieldAlert />}
                title="المزاد متعلّم متعثر"
                className="mb-6"
              >
                الفايز مااستكملش الصفقة. السبب الكامل متسجّل في سجل التدقيق.
              </Banner>
            ) : null}

            {/* ───── العربية + حالة المزاد ───── */}
            <div className="mb-9 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <div className="flex flex-wrap items-start gap-5">
                  {a.listing.imageUrl ? (
                    // صور محلية في public/cars — img عادي مش next/image
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.listing.imageUrl}
                      alt=""
                      className="h-[132px] w-[196px] shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-[132px] w-[196px] shrink-0 items-center justify-center rounded-md bg-muted-soft text-content-faint">
                      <Car className="h-8 w-8" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-h2 text-content">{a.listing.title}</h2>
                      <Badge
                        tone={
                          overdue ? 'crit' : STATUS_BADGE[a.status].tone
                        }
                        icon={overdue ? <AlertTriangle /> : STATUS_BADGE[a.status].icon}
                      >
                        {overdue ? 'متأخر عن القفل' : STATUS_BADGE[a.status].label}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sub text-content-sub">
                      <span className="tnum">{a.listing.year}</span>
                      <span className="tnum inline-flex items-center gap-1.5">
                        <Gauge className="h-4 w-4 text-content-faint" />
                        {withThousands(a.listing.km)} كم
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-content-faint" />
                        {a.listing.governorate}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Metric label="سعر الإعلان" value={formatEGP(a.listing.price)} />
                      <Metric
                        label="سعر البداية"
                        value={formatEGP(a.startPrice)}
                        hint="٨٥٪ من سعر الإعلان"
                      />
                      <Metric
                        label="السعر المحجوز"
                        value={a.reservePrice === null ? 'من غير حد أدنى' : formatEGP(a.reservePrice)}
                        hint={a.reservePrice === null ? 'أي سعر بيعدّي' : 'أقل سعر مقبول للبيع'}
                      />
                    </div>

                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-sub text-content-sub">
                        عرض «بيع حالًا» المكافئ للعربية دي{' '}
                        <span className="tnum font-bold text-content">
                          {formatEGP(sellNowEquivalent)}
                        </span>{' '}
                        —{' '}
                        {a.bidsCount === 0 ? (
                          <span className="text-content-faint">لسه مفيش مزايدات للمقارنة</span>
                        ) : beatsSellNow ? (
                          <span className="font-bold text-ok">المزاد عدّاه</span>
                        ) : (
                          <span className="font-bold text-warn">المزاد لسه تحته</span>
                        )}
                      </p>
                      <Link
                        href={`/listings/${a.listing.id}`}
                        className="mt-1 inline-block text-caption text-accent transition-colors hover:text-content"
                      >
                        افتح الإعلان
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center gap-2">
                  {a.status === 'live' ? <PulseDot tone={overdue ? 'crit' : 'accent'} /> : null}
                  <p className="text-caption text-content-sub">
                    {a.status === 'live'
                      ? overdue
                        ? 'كان لازم يقفل'
                        : 'باقي على القفل'
                      : 'قفل'}
                  </p>
                </div>

                <div className="mt-1">
                  {a.status === 'live' && !overdue ? (
                    <Countdown endsAt={a.endsAt} size="lg" />
                  ) : (
                    <p className={overdue ? 'text-h2 text-crit' : 'text-h2 text-content'}>
                      {relTimeAr(a.endsAt)}
                    </p>
                  )}
                  <p className="mt-1 text-caption text-content-faint">
                    {formatDateTimeAr(a.endsAt)}
                  </p>
                </div>

                <div className="mt-5 space-y-4 border-t border-line pt-4">
                  <Metric
                    label="أعلى مزايدة"
                    value={formatEGP(a.currentBid)}
                    hint={
                      a.bidsCount > 0
                        ? `+${Math.round(risePct)}٪ فوق سعر البداية`
                        : 'لسه مفيش مزايدات'
                    }
                    tone="accent"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Metric label="عدد المزايدات" value={withThousands(a.bidsCount)} />
                    <Metric
                      label="مرات التمديد"
                      value={withThousands(a.extensionCount)}
                      hint="مضاد للقنص"
                    />
                  </div>
                  <Metric
                    label="معارض دافعة رسوم الدخول"
                    value={`${withThousands(paidCount)} من ${withThousands(entryRows.length)}`}
                    hint="اللي مادفعش مش قادر يزايد"
                  />
                </div>

                {blocked ? (
                  <p className="mt-5 rounded-sm bg-muted-soft px-3.5 py-2.5 text-caption text-content-sub">
                    «تعليم متعثر» مقفول: {blocked}
                  </p>
                ) : (
                  <p className="mt-5 rounded-sm bg-warn-soft px-3.5 py-2.5 text-caption text-warn">
                    المزاد متسوّى — لو الفايز مااستلمش ومادفعش، علّمه متعثر من زرار الرأس.
                  </p>
                )}
              </Card>
            </div>

            {/* ───── C-22: منحنى المزاد ───── */}
            <ChartFrame
              code="C-22"
              title="منحنى المزاد"
              hint="المزايدة قفزات مش تدرّج — فالخط درجي بيفضل ثابت لحد ما تيجي مزايدة"
              height={300}
              loading={bids.isLoading}
              error={bids.error ? errorMessage(bids.error) : undefined}
              isEmpty={!bids.isLoading && bidRows.length === 0}
              sparse={
                !bids.isLoading && bidRows.length > 0 && bidRows.length < 3 ? (
                  <SparseValues
                    items={[
                      { label: 'سعر البداية', value: formatEGP(a.startPrice) },
                      { label: 'أعلى مزايدة', value: formatEGP(a.currentBid) },
                      { label: 'عدد المزايدات', value: withThousands(a.bidsCount) },
                    ]}
                  />
                ) : undefined
              }
              footnote={`سعر البداية ${formatEGP(a.startPrice)} · خطوة المزايدة ${formatEGP(
                a.bidStep,
              )}`}
              tableColumns={[
                { key: 'label', label: 'الوقت' },
                { key: 'amount', label: 'المبلغ' },
              ]}
              tableRows={[
                { label: 'سعر البداية', amount: a.startPrice },
                ...[...bidRows]
                  .sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt))
                  .map((b) => ({ label: formatDateTimeAr(b.createdAt), amount: b.amount })),
              ]}
              className="mb-9"
            >
              <TimeSeriesLine
                data={curve}
                series={[{ key: 'amount', label: 'أعلى مزايدة', color: seriesColor(0) }]}
                step
                height={300}
                unit="ج.م"
              />
            </ChartFrame>

            {/* ───── المزايدات ───── */}
            <SectionHeader
              title="المزايدات"
              hint="اسم المعرض علني جوه المزاد بالتصميم — من غير تليفونات ولا بيانات تواصل"
            />
            <DataTable
              rows={bidRows}
              columns={bidColumns}
              rowKey={(b) => b.id}
              loading={bids.isLoading}
              error={bids.error ? errorMessage(bids.error) : undefined}
              onRetry={() => bids.refetch()}
              exportName={`carq-auction-${id}-bids`}
              emptyTitle="مفيش مزايدات لحد دلوقتي"
              emptyHint="المزاد يا إما لسه بدأ، يا إما مفيش معرض متعاقد ودافع الرسوم شايفه."
              className="mb-9"
            />

            {/* ───── تسجيلات الدخول ───── */}
            <SectionHeader
              title="تسجيلات الدخول ورسومها"
              hint="الدفع هو الشرط التالت من تلاتة للمزايدة — بعد دور المعرض والتعاقد"
            />
            <DataTable
              rows={entryRows}
              columns={entryColumns}
              rowKey={(e) => e.id}
              loading={entries.isLoading}
              error={entries.error ? errorMessage(entries.error) : undefined}
              onRetry={() => entries.refetch()}
              rowTone={(e) => (e.paidAt ? undefined : 'warn')}
              exportName={`carq-auction-${id}-entries`}
              emptyTitle="مفيش معرض سجّل في المزاد ده"
              emptyHint="المعارض المتعاقدة بس هي اللي بتقدر تسجّل."
            />
          </>
        )}

        <ConfirmDialog
          open={defaultOpen}
          onClose={() => setDefaultOpen(false)}
          onConfirm={confirmDefault}
          title="تعليم المزاد متعثر"
          impact="الفايز مااستكملش الصفقة. الحالة هتتغيّر لـ«متعثر» وهتفضل في سجل المعرض، والأكشن ده مابيترجعش."
          confirmLabel="علّمه متعثر"
          typeToConfirm="متعثر"
          loading={markDefaulted.isPending}
        >
          {a ? (
            <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
              <p className="text-sub text-content">{a.listing.title}</p>
              <p className="tnum mt-1 text-caption text-content-sub">
                رست بـ{formatEGP(a.currentBid)}
                {bidRows[0] ? ` · ${bidRows[0].exhibitionName}` : ''}
              </p>
            </div>
          ) : null}
        </ConfirmDialog>

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
