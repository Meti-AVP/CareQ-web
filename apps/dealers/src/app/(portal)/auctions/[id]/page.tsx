'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Car,
  CheckCircle2,
  Clock3,
  Crown,
  FileSignature,
  Gauge,
  Gavel,
  Lock,
  MapPin,
  RefreshCw,
  Store,
  Timer,
  Trophy,
  WifiOff,
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
  Dialog,
  ErrorState,
  PageHeader,
  PulseDot,
  SectionHeader,
  Sheet,
  Skeleton,
  TimeSeriesLine,
  formatDateTimeAr,
  formatEGP,
  formatKm,
  formatTimeAr,
  relTimeAr,
  secondsUntil,
  seriesColor,
  useToast,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorCode,
  errorMessage,
  useCreateEntry,
  useDealerAuction,
  useDealerBids,
  useMyEntries,
  useMyExhibition,
  usePlaceBid,
  type AuctionBid,
  type ErrorCode,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/auctions/[id]` — غرفة المزايدة الحية (EXHIBITION_PORTAL_SPEC §4.5)
 *
 * القاعدة الحاكمة (A-0): **السيرفر هو اللي بيقرر، والواجهة بتعرض بس.**
 *
 *  ١) **الواجهة مابتخترعش رقم ولا وقت.** الزرار بيبعت `auction.nextBid`
 *     زي ما السيرفر رجّعه بالظبط — ممنوع `currentBid + bidStep`،
 *     و`bidStep` عمود في الداتابيز مش ثابت في الكود (A-3).
 *  ٢) **الحالة بتتقرا REST عند كل فتح** قبل أي تحديث حي: الـhooks
 *     بتعمل fetch أول ما الصفحة تفتح وبعدين polling (staleTime: 0).
 *     الـpolling ده **بديل مؤقت للـWebSocket في المرحلة ١** — الخطوة
 *     الجاية هي الاشتراك في topic `auction:{id}` بالبروتوكول الموصوف
 *     في §4.5: `auth` ثم `subscribe` بـ`since: lastEventId`، والأحداث
 *     `bid.placed` · `auction.extended` · `auction.ended`. لما يتركّب،
 *     الـREST بيفضل هو البداية والـWS بيكمّل مش بيبدأ.
 *  ٣) **التمديد بيتعرض صراحة.** عداد بيقفز من غير تفسير بيبان باج،
 *     فإحنا بنراقب `endsAt` و`extensionCount` وبنقول «المزاد اتمدّ».
 *  ٤) **قطع الاتصال بيتقال.** مزايد شايف رقم بايت هيخسر فلوس.
 *  ٥) **انتهاء المزاد = خلاص.** الزرار بيتقفل فورًا.
 *  ٦) **ممنوع المزايدة على عربيتك** (A-7) — الزرار بيتخفي أصلًا.
 * ════════════════════════════════════════════════════════════════
 */

const STATUS_LABEL: Record<string, string> = {
  live: 'شغال',
  settled: 'اتسوّى',
  failed: 'فشل — مفيش مزايدات',
  defaulted: 'متعثر',
};

export default function AuctionRoomPage() {
  const params = useParams<{ id: string }>();
  const auctionId = String(params?.id ?? '');
  const router = useRouter();
  const toast = useToast();

  // القراءة REST الأول — والـpolling بديل الـWS في المرحلة ١ (§4.5 بند ١)
  const auctionQ = useDealerAuction(auctionId);
  const bidsQ = useDealerBids(auctionId);
  const exhibitionQ = useMyExhibition();
  const entriesQ = useMyEntries();
  const placeBid = usePlaceBid();
  const createEntry = useCreateEntry();

  const auction = auctionQ.data;
  const exhibition = exhibitionQ.data;
  const bids = useMemo(() => bidsQ.data ?? [], [bidsQ.data]);

  const entry = useMemo(
    () => (entriesQ.data ?? []).find((e) => e.auctionId === auctionId) ?? null,
    [entriesQ.data, auctionId],
  );

  /** كود الخطأ الأخير من السيرفر — لكل كود شاشته، مش toast واحد (§4.5) */
  const [blocked, setBlocked] = useState<{ code: ErrorCode; message: string } | null>(null);
  /** اتسبقت في نفس اللحظة — مش «خطأ»، ده سباق طبيعي (A-4) */
  const [outbid, setOutbid] = useState<{ message: string; nextBid: number } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** 429: تعطيل مؤقت — **مش إعادة محاولة تلقائية** (§10.6) */
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // تنضيف المؤقت مع الخروج — setState بعد unmount تحذير وتسريب
  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    [],
  );
  const [clockEnded, setClockEnded] = useState(false);
  const [extendNote, setExtendNote] = useState<string | null>(null);

  /* ─────────── التمديد ضد القنص: لازم يتعرض صراحة (A-5) ─────────── */
  const seenRef = useRef<{ endsAt: string; extensionCount: number } | null>(null);
  const endsAt = auction?.endsAt;
  const extensionCount = auction?.extensionCount;

  useEffect(() => {
    if (endsAt === undefined || extensionCount === undefined) return;
    const seen = seenRef.current;
    seenRef.current = { endsAt, extensionCount };
    if (!seen) return;
    if (extensionCount > seen.extensionCount || endsAt !== seen.endsAt) {
      setClockEnded(false);
      setExtendNote(`المزاد اتمدّ — بينتهي ${formatDateTimeAr(endsAt)}`);
      toast({
        title: 'المزاد اتمدّ 60 ثانية',
        body: 'حد زايد في آخر دقيقة، والتمديد بيمنع القنص في الثواني الأخيرة.',
        tone: 'info',
      });
    }
  }, [endsAt, extensionCount, toast]);

  /* ─────────── انتهاء المزاد: اقفل فورًا ─────────── */
  useEffect(() => {
    if (!endsAt) return;
    setClockEnded(secondsUntil(endsAt) <= 0);
  }, [endsAt]);

  const onCountdownEnd = useCallback(() => {
    setClockEnded(true);
    void auctionQ.refetch();
    void bidsQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetchAll = useCallback(() => {
    void auctionQ.refetch();
    void bidsQ.refetch();
    void entriesQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────── الشروط الثلاثة (A-1) — كل واحد بسببه وخطوته ─────────── */
  const isOwnListing =
    blocked?.code === 'CANNOT_BID_OWN_LISTING' ||
    blocked?.code === 'SELF_BID' ||
    Boolean(exhibition && auction && auction.sellerId === exhibition.userId);
  const notContracted =
    blocked?.code === 'NOT_CONTRACTED' || Boolean(exhibition && !exhibition.isContracted);
  const notVerified = Boolean(exhibition && !exhibition.verified);
  const entryMissing = !entry && !auction?.myEntry;
  const entryUnpaid = !entryMissing && !(entry?.paidAt || auction?.myEntry?.paid);

  const ended = Boolean(auction && (auction.status !== 'live' || clockEnded));
  const canBid =
    Boolean(auction) &&
    !ended &&
    !notVerified &&
    !notContracted &&
    !entryMissing &&
    !entryUnpaid &&
    !isOwnListing;
  /** لسه بنقرا حالة الدخول — متعرضش «مش مسجّل» وإحنا لسه مش عارفين */
  const entryUnknown = entriesQ.isLoading && !entry && !auction?.myEntry;

  /**
   * خطأ الدخول بيتمسح لما الأدمن يأكّد التحويل فعلًا.
   * `NOT_CONTRACTED` **مابيتمسحش لوحده**: السيرفر قال لأ، فالبانر بيفضل
   * لحد ما مزايدة ناجحة أو تحديث الصفحة يثبت العكس (A-0).
   */
  useEffect(() => {
    if (
      (blocked?.code === 'ENTRY_NOT_PAID' || blocked?.code === 'ENTRY_UNPAID') &&
      !entryMissing &&
      !entryUnpaid
    )
      setBlocked(null);
  }, [blocked, entryMissing, entryUnpaid]);

  const myTopBid = useMemo(() => {
    if (!exhibition) return 0;
    return bids
      .filter((b) => b.bidderId === exhibition.id)
      .reduce((max, b) => (b.amount > max ? b.amount : max), 0);
  }, [bids, exhibition]);

  const iAmTop = Boolean(auction && auction.bidsCount > 0 && myTopBid === auction.currentBid);
  const iWasOutbid = myTopBid > 0 && !iAmTop;
  const winnerBid = auction?.winnerBidId ? bids.find((b) => b.id === auction.winnerBidId) : undefined;
  const iWon = Boolean(winnerBid && exhibition && winnerBid.bidderId === exhibition.id);

  /* ─────────── التعامل مع أخطاء المزايدة: ٦ أكواد، ٦ شاشات ─────────── */
  const handleBidError = async (err: unknown) => {
    const code = errorCode(err);
    const message = errorMessage(err);

    switch (code) {
      // ماكانش المفروض يوصل هنا أصلًا — رجّعه للتقديم
      case 'NOT_AN_EXHIBITION':
        toast({ title: message, tone: 'crit' });
        router.push('/apply');
        return;

      // بانر + لينك التعاقد + قفل المزايدة في كل الشاشة
      case 'NOT_CONTRACTED':
        setBlocked({ code, message });
        void exhibitionQ.refetch();
        return;

      // أكتر خطأ متوقع — افتح فلو الدفع فورًا (ENTRY_UNPAID اسم بديل من الباك)
      case 'ENTRY_NOT_PAID':
      case 'ENTRY_UNPAID':
        setBlocked({ code, message });
        void entriesQ.refetch();
        setPayOpen(true);
        return;

      // A-7 — الزرار بيتخفي، والخطأ بيتستقبل برضه (SELF_BID اسم بديل)
      case 'CANNOT_BID_OWN_LISTING':
      case 'SELF_BID':
        setBlocked({ code, message });
        return;

      // اسحب الحالة، اقفل، واعرض النتيجة (AUCTION_CLOSED اسم بديل)
      case 'AUCTION_NOT_LIVE':
      case 'AUCTION_ENDED':
      case 'AUCTION_CLOSED':
        setBlocked({ code, message });
        setClockEnded(true);
        await auctionQ.refetch();
        void bidsQ.refetch();
        return;

      // مش «خطأ» — حد سبقك بثانية. اسحب nextBid الجديد وحط زرار جاهز بيه
      case 'BID_TOO_LOW':
      case 'BID_NOT_ON_STEP': {
        const fresh = await auctionQ.refetch();
        void bidsQ.refetch();
        const next = fresh.data?.nextBid;
        if (next) setOutbid({ message, nextBid: next });
        return;
      }

      // 429 — عطّل ثانيتين. إعادة المحاولة في مزاد بتعمل مزايدة مش مقصودة
      case 'RATE_LIMITED':
        setCooldown(true);
        toast({ title: message, body: 'استنى ثانيتين وجرّب تاني.', tone: 'crit' });
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => setCooldown(false), 2000);
        return;

      default:
        toast({ title: message, tone: 'crit' });
    }
  };

  /** المبلغ = `auction.nextBid` بالظبط — ولا حساب واحد في الفرونت (A-3) */
  const submitBid = async () => {
    if (!auction) return;
    setConfirmOpen(false);
    const amount = auction.nextBid;
    try {
      await placeBid.mutateAsync({ auctionId: auction.id, amount });
      setOutbid(null);
      setBlocked(null);
      toast({ title: `مزايدتك اتسجّلت — ${formatEGP(amount)}`, tone: 'ok' });
    } catch (err) {
      await handleBidError(err);
    }
  };

  const registerEntry = () => {
    createEntry.mutate(
      { auctionId },
      {
        onSuccess: () => {
          void entriesQ.refetch();
          void auctionQ.refetch();
          toast({
            title: 'سجّلنا دخولك في المزاد',
            body: 'دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل.',
            tone: 'ok',
          });
        },
        onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
      },
    );
  };

  /* ─────────── D-10: منحنى المزاد — خط درجي، ومزايداتي بلون مميز ─────────── */
  const chartRows = useMemo(() => {
    if (!auction) return [];
    const asc = [...bids].sort(
      (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime(),
    );
    const rows: Array<Record<string, string | number>> = [
      { label: 'البداية', amount: auction.startPrice },
    ];
    let mine = 0;
    for (const b of asc) {
      if (exhibition && b.bidderId === exhibition.id) mine = b.amount;
      const row: Record<string, string | number> = {
        label: formatTimeAr(b.createdAt),
        amount: b.amount,
      };
      if (mine > 0) row.mine = mine;
      rows.push(row);
    }
    return rows;
  }, [auction, bids, exhibition]);

  const chartSeries = useMemo(() => {
    const base = [{ key: 'amount', label: 'المزايدة', color: seriesColor(0) }];
    if (myTopBid > 0) base.push({ key: 'mine', label: 'مزايداتي', color: seriesColor(2) });
    return base;
  }, [myTopBid]);

  const bidColumns: Array<Column<AuctionBid>> = [
    {
      key: 'exhibitionName',
      header: 'المعرض',
      value: (b) => b.exhibitionName,
      render: (b) => {
        const mine = Boolean(exhibition && b.bidderId === exhibition.id);
        return (
          <span className="flex items-center gap-2">
            <span className={mine ? 'font-bold text-accent' : 'text-content'}>
              {b.exhibitionName}
            </span>
            {mine ? (
              <Badge tone="accent" icon={<Gavel />}>
                مزايدتك
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'المبلغ',
      align: 'end',
      sortable: true,
      value: (b) => b.amount,
      render: (b) => {
        const mine = Boolean(exhibition && b.bidderId === exhibition.id);
        return (
          <span className={mine ? 'tnum font-extrabold text-accent' : 'tnum font-bold text-content'}>
            {formatEGP(b.amount)}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'الوقت',
      align: 'end',
      sortable: true,
      value: (b) => new Date(b.createdAt).getTime(),
      render: (b) => (
        <span className="block text-caption text-content-sub">
          {formatTimeAr(b.createdAt)} · {relTimeAr(b.createdAt)}
        </span>
      ),
    },
  ];

  /* ─────────── التحميل والخطأ الأول ─────────── */
  if (auctionQ.isLoading && !auction) {
    return (
      <>
        <PageHeader title="غرفة المزايدة" subtitle="بنقرا حالة المزاد من السيرفر…" motif="none" />
        <Sheet>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <Skeleton className="h-[260px] w-full" />
              <Skeleton className="h-[220px] w-full" />
            </div>
            <Skeleton className="h-[320px] w-full" />
          </div>
        </Sheet>
      </>
    );
  }

  if (!auction) {
    return (
      <>
        <PageHeader title="غرفة المزايدة" subtitle="مقدرناش نجيب حالة المزاد" motif="none" />
        <Sheet>
          <Card>
            <ErrorState
              message={auctionQ.isError ? errorMessage(auctionQ.error) : 'المزاد مش موجود'}
              onRetry={() => auctionQ.refetch()}
            />
          </Card>
        </Sheet>
      </>
    );
  }

  const listing = auction.listing;
  const feeLabel = entry && entry.fee > 0 ? formatEGP(entry.fee) : 'بتتحدد من CarQ حسب عقد معرضك';

  return (
    <>
      {/*
        الحركة البطلة هنا **العداد الحي** — مش خط الرأس المرسوم.
        شاشة فيها فلوس بتتحرك مالهاش لزوم زخرفة بتتحرك معاها.
      */}
      <PageHeader
        title={listing.title}
        subtitle={`${listing.year} · ${formatKm(listing.km)} · ${listing.governorate} — المزاد ${STATUS_LABEL[auction.status] ?? auction.status}`}
        motif="none"
        actions={
          <Button
            variant="white"
            size="sm"
            iconEnd={<ArrowRight />}
            onClick={() => router.push('/auctions')}
          >
            كل المزادات
          </Button>
        }
      />

      <Sheet>
        {/* قطع الاتصال: بانر + سحب REST تاني. الرقم البايت بيخسّر فلوس (§4.5 بند ٢) */}
        {auctionQ.isError || bidsQ.isError ? (
          <Banner
            tone="crit"
            icon={<WifiOff />}
            title="الاتصال اتقطع — الأرقام اللي قدامك ممكن تكون قديمة"
            action={
              <Button variant="danger" size="sm" icon={<RefreshCw />} onClick={refetchAll}>
                تحديث
              </Button>
            }
            className="mb-5"
          >
            متزايدش على رقم مش متأكد منه. اضغط تحديث عشان نسحب حالة المزاد من السيرفر تاني.
          </Banner>
        ) : null}

        {/* التمديد ضد القنص — لازم يتعرض صراحة (A-5) */}
        {extendNote && !ended ? (
          <Banner
            tone="accent"
            icon={<Timer />}
            title="المزاد اتمدّ 60 ثانية"
            className="mb-5"
            action={
              <Button variant="ghost" size="sm" onClick={() => setExtendNote(null)}>
                تمام
              </Button>
            }
          >
            {extendNote} · اتمدّ {withThousands(auction.extensionCount)} مرة لحد دلوقتي، والحد
            الأقصى 20 مرة.
          </Banner>
        ) : null}

        {/* الشرط ٢ من ٣ (A-1): التعاقد — قفل المزايدة في كل الشاشة مع السبب */}
        {notContracted ? (
          <Banner
            tone="warn"
            icon={<FileSignature />}
            title="معرضك مش متعاقد — المزايدة مقفولة"
            className="mb-5"
            action={
              <Link href="/contract">
                <Button variant="outline" size="sm">
                  صفحة التعاقد
                </Button>
              </Link>
            }
          >
            {blocked?.code === 'NOT_CONTRACTED'
              ? blocked.message
              : 'التعاقد هو اللي بيفتح المزايدة. توثيق المعرض حاجة، والعقد الساري حاجة تانية.'}
          </Banner>
        ) : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* ═════════ العمود الواسع: العربية + المواصفات + منحنى المزاد ═════════ */}
          <div className="min-w-0 space-y-5 xl:col-span-2">
            <Card padded={false} className="overflow-hidden">
              <div className="flex h-[260px] items-center justify-center bg-muted-soft">
                {listing.imageUrl ? (
                  // الصور محلية في public/cars — img عادي مش next/image
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.imageUrl}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Car className="h-12 w-12 text-content-faint" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <div>
                  <p className="text-caption text-content-sub">سعر الإعلان</p>
                  <p className="tnum mt-1 text-title text-content">{formatEGP(listing.price)}</p>
                </div>
                <div>
                  <p className="text-caption text-content-sub">سعر البداية (85٪)</p>
                  <p className="tnum mt-1 text-title text-content">{formatEGP(auction.startPrice)}</p>
                </div>
                <div>
                  <p className="text-caption text-content-sub">العداد</p>
                  <p className="tnum mt-1 flex items-center gap-1.5 text-title text-content">
                    <Gauge className="h-4 w-4 text-content-faint" />
                    {formatKm(listing.km)}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-content-sub">المكان</p>
                  <p className="mt-1 flex items-center gap-1.5 text-title text-content">
                    <MapPin className="h-4 w-4 text-content-faint" />
                    {listing.governorate}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
                <Badge tone={auction.status === 'live' ? 'ok' : 'neutral'} icon={<Gavel />}>
                  {STATUS_LABEL[auction.status] ?? auction.status}
                </Badge>
                <Badge tone="neutral" icon={<Timer />}>
                  خطوة المزايدة {formatEGP(auction.bidStep)}
                </Badge>
                <Badge tone="neutral" icon={<Trophy />}>
                  {withThousands(auction.bidsCount)} مزايدة
                </Badge>
                <span className="text-caption text-content-faint">
                  اتفتح {formatDateTimeAr(auction.createdAt)}
                </span>
              </div>
            </Card>

            <ChartFrame
              code="D-10"
              title="منحنى المزاد"
              hint="خط درجي — المزايدة قفزات على خطوة ثابتة، مش تدرّج ناعم"
              series={chartSeries}
              loading={bidsQ.isLoading}
              error={bidsQ.isError ? errorMessage(bidsQ.error) : undefined}
              isEmpty={!bidsQ.isLoading && bids.length === 0}
              height={280}
              tableColumns={[
                { key: 'label', label: 'الوقت' },
                { key: 'amount', label: 'المزايدة' },
                { key: 'mine', label: 'مزايداتي' },
              ]}
              tableRows={chartRows}
              footnote={
                myTopBid > 0
                  ? `أعلى مزايدة ليك في المزاد ده ${formatEGP(myTopBid)}`
                  : 'لسه مازايدتش في المزاد ده'
              }
            >
              <TimeSeriesLine data={chartRows} series={chartSeries} height={280} step unit="ج.م" />
            </ChartFrame>
          </div>

          {/* ═════════ العمود الجانبي اللاصق: المزايدة الحالية والعداد والزرار ═════════ */}
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <p className="text-caption text-content-sub">المزايدة الحالية</p>
                {auction.status === 'live' && !ended ? (
                  <span className="flex items-center gap-1.5 text-caption font-bold text-crit">
                    <PulseDot />
                    مباشر
                  </span>
                ) : null}
              </div>
              <p className="tnum mt-1 text-display leading-none text-content">
                {formatEGP(auction.currentBid)}
              </p>
              <p className="mt-2 text-caption text-content-sub">
                {withThousands(auction.bidsCount)} مزايدة على العربية دي
              </p>

              <div className="mt-4">
                {iAmTop ? (
                  <Badge tone="ok" icon={<Crown />}>
                    إنت الأعلى دلوقتي
                  </Badge>
                ) : iWasOutbid ? (
                  <Badge tone="crit" icon={<AlertTriangle />}>
                    اتخطّيت — أعلى مزايدة ليك {formatEGP(myTopBid)}
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon={<Gavel />}>
                    لسه مازايدتش
                  </Badge>
                )}
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <p className="text-caption text-content-sub">
                  {ended ? 'المزاد قفل' : 'ينتهي خلال'}
                </p>
                <div className="mt-1">
                  <Countdown
                    endsAt={auction.endsAt}
                    size="lg"
                    onEnd={onCountdownEnd}
                    urgentBelow={120}
                  />
                </div>
                <p className="mt-2 text-caption text-content-faint">
                  الوقت من السيرفر · {formatDateTimeAr(auction.endsAt)}
                  {auction.extensionCount > 0
                    ? ` · اتمدّ ${withThousands(auction.extensionCount)} مرة`
                    : ''}
                </p>
              </div>
            </Card>

            {/* اتسبقت في نفس اللحظة — مش خطأ، ده سباق. الزرار جاهز بالرقم الجديد */}
            {outbid && !ended ? (
              <Banner
                tone="accent"
                icon={<Timer />}
                title="حد زايد قبلك بثانية"
                action={
                  <Button
                    size="sm"
                    onClick={submitBid}
                    loading={placeBid.isPending}
                    disabled={!canBid || cooldown}
                  >
                    زايد {formatEGP(outbid.nextBid)}
                  </Button>
                }
              >
                المزايدة الجاية بقت {formatEGP(outbid.nextBid)} — السيرفر بيرتّب المزايدات بالثانية،
                فالرقم بيتغيّر بينك وبين الضغطة.
              </Banner>
            ) : null}

            {/* A-7: عربيتك — الزرار بيتخفي أصلًا، والسبب مكتوب */}
            {isOwnListing ? (
              <Banner tone="neutral" icon={<Store />} title="دي عربيتك — مينفعش تزايد عليها">
                {blocked?.code === 'CANNOT_BID_OWN_LISTING'
                  ? blocked.message
                  : 'المعارض بتبيع في المزاد زي ما بتشتري، فالمزايدة على إعلانك ممنوعة.'}
              </Banner>
            ) : ended ? (
              <Card className={iWon ? 'border-ok/30 bg-ok-soft' : ''}>
                <p className="flex items-center gap-2 text-title text-content">
                  {iWon ? (
                    <>
                      <Trophy className="h-5 w-5 text-ok" />
                      كسبت المزاد
                    </>
                  ) : (
                    <>
                      <Lock className="h-5 w-5 text-content-faint" />
                      المزاد انتهى
                    </>
                  )}
                </p>
                <p className="mt-2 text-sub text-content-sub">
                  {auction.bidsCount > 0
                    ? `أعلى مزايدة ${formatEGP(auction.currentBid)}`
                    : 'مفيش ولا مزايدة واحدة على العربية دي.'}
                  {winnerBid ? ` · المعرض الكاسب ${winnerBid.exhibitionName}` : ''}
                </p>
                <p className="mt-2 text-caption text-content-faint">
                  قفل المزاد بيحصل في السيرفر نفسه — مش من الشاشة.
                </p>
              </Card>
            ) : (
              <Card>
                {/*
                  تشيك ليست الشروط الثلاثة (A-1) **قبل الزرار** —
                  المزايد لازم يعرف هو مؤهل ولا لأ قبل ما يمد إيده.
                */}
                <div className="space-y-3">
                  <p
                    className={
                      notVerified
                        ? 'flex items-center gap-1.5 text-sub font-bold text-warn'
                        : 'flex items-center gap-1.5 text-sub font-bold text-ok'
                    }
                  >
                    {notVerified ? (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        معرضك لسه مش موثّق
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        معرضك موثّق
                      </>
                    )}
                  </p>

                  <p
                    className={
                      notContracted
                        ? 'flex items-center gap-1.5 text-sub font-bold text-warn'
                        : 'flex items-center gap-1.5 text-sub font-bold text-ok'
                    }
                  >
                    {notContracted ? (
                      <>
                        <FileSignature className="h-4 w-4" />
                        العقد مش ساري — المزايدة مقفولة
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        معرضك متعاقد
                      </>
                    )}
                  </p>

                  {entryUnknown ? (
                    <p className="flex items-center gap-1.5 text-sub text-content-sub">
                      <Clock3 className="h-4 w-4 text-content-faint" />
                      بنقرا حالة دخولك في المزاد…
                    </p>
                  ) : entryMissing ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sub font-bold text-content">
                          <Lock className="h-4 w-4 text-crit" />
                          مش مسجّل في المزاد
                        </p>
                        <p className="mt-0.5 text-caption text-content-sub">
                          لازم تسجّل دخولك الأول، وبعدين تحوّل رسوم الدخول.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ink"
                        loading={createEntry.isPending}
                        onClick={registerEntry}
                      >
                        ادخل المزاد
                      </Button>
                    </div>
                  ) : entryUnpaid ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sub font-bold text-content">
                          <Clock3 className="h-4 w-4 text-warn" />
                          دخولك مستني تأكيد التحويل
                        </p>
                        <p className="mt-0.5 text-caption text-content-sub">
                          بنأكّد التحويل يدوي — عادة خلال ساعة عمل.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                        تفاصيل الدفع
                      </Button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sub font-bold text-ok">
                      <CheckCircle2 className="h-4 w-4" />
                      دخولك متأكّد — تقدر تزايد
                    </p>
                  )}
                </div>

                <div className="mt-4 border-t border-line pt-4">
                  <Button
                    className="w-full"
                    size="lg"
                    icon={<Gavel />}
                    disabled={!canBid || cooldown}
                    loading={placeBid.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    زايد {formatEGP(auction.nextBid)}
                  </Button>
                  <p className="mt-3 text-caption text-content-sub">
                    الرقم ده جاي من السيرفر زي ما هو — خطوة المزايدة {formatEGP(auction.bidStep)}،
                    والمزايدة ملزمة.
                  </p>
                  {cooldown ? (
                    <p className="mt-2 flex items-center gap-1.5 text-caption font-bold text-crit">
                      <Clock3 className="h-3.5 w-3.5" />
                      وصلت حد المزايدات في الدقيقة — الزرار هيرجع بعد ثانيتين.
                    </p>
                  ) : null}
                </div>
              </Card>
            )}

        {/* رسالة السيرفر زي ما هي (X-4) لأي كود مالوش شاشة مخصوصة */}
        {blocked &&
        blocked.code !== 'NOT_CONTRACTED' &&
        blocked.code !== 'CANNOT_BID_OWN_LISTING' &&
        blocked.code !== 'SELF_BID' ? (
          <Banner tone="crit" icon={<AlertTriangle />} title={blocked.message}>
            {blocked.code === 'ENTRY_NOT_PAID' || blocked.code === 'ENTRY_UNPAID'
              ? 'دخولك في المزاد لسه مش متأكّد — التفاصيل في نافذة الدفع.'
              : 'اسحب الحالة تاني قبل أي مزايدة.'}
          </Banner>
        ) : null}
          </aside>
        </div>

        {/* ═════════ سجل المزايدات ═════════ */}
        <SectionHeader
          title="سجل المزايدات"
          hint="أسماء المعارض علنية جوه المزاد بالتصميم — من غير تليفونات"
          className="mt-8"
        />
        <DataTable
          rows={bids}
          columns={bidColumns}
          rowKey={(b) => b.id}
          loading={bidsQ.isLoading}
          error={bidsQ.isError ? errorMessage(bidsQ.error) : undefined}
          onRetry={() => bidsQ.refetch()}
          emptyTitle="مفيش مزايدات لسه"
          emptyHint="أول مزايدة بتبدأ من سعر البداية — 85٪ من سعر الإعلان."
          exportName={`carq-auction-${auction.id}-bids`}
        />
      </Sheet>

      {/* ═════════ تأكيد المزايدة — الأكشن الوحيد اللي بيحرّك فلوس ═════════ */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submitBid}
        title={`تأكيد المزايدة ${formatEGP(auction.nextBid)}`}
        impact="المزايدة ملزمة: لو كسبت المزاد، المعرض مسؤول عن استلام العربية بالسعر ده."
        confirmLabel={`زايد ${formatEGP(auction.nextBid)}`}
        tone="accent"
        requireReason={false}
        loading={placeBid.isPending}
      >
        <div className="space-y-2 text-sub text-content-sub">
          <p>
            العربية: <span className="font-bold text-content">{listing.title}</span>
          </p>
          <p>
            المزايدة الحالية{' '}
            <span className="tnum font-bold text-content">{formatEGP(auction.currentBid)}</span> ·
            خطوة المزايدة{' '}
            <span className="tnum font-bold text-content">{formatEGP(auction.bidStep)}</span>
          </p>
          <p className="text-caption text-content-faint">
            الرقم اللي بيتبعت هو رقم المزايدة الجاية من السيرفر — لو حد سبقك، هنقولك الرقم الجديد
            بدل ما
            نبعت رقم قديم.
          </p>
        </div>
      </ConfirmDialog>

      {/* ═════════ فلو دفع رسوم الدخول — أكتر خطأ متوقع (§4.6) ═════════ */}
      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="دفع رسوم دخول المزاد"
        subtitle="الدخول بيتفعّل بعد ما CarQ تأكّد التحويل"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              أقفل
            </Button>
            {entryMissing ? (
              <Button icon={<Gavel />} loading={createEntry.isPending} onClick={registerEntry}>
                سجّل دخولي
              </Button>
            ) : (
              <Link href="/billing">
                <Button icon={<Banknote />}>ارفع إيصال التحويل</Button>
              </Link>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-warn/25 bg-warn-soft px-4 py-3">
            <p className="text-sub font-bold text-warn">
              دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sub text-content-sub">
              رسوم الدخول: <span className="font-bold text-content">{feeLabel}</span>
            </p>
            <p className="text-sub text-content-sub">
              حالة دخولك:{' '}
              <span className="font-bold text-content">
                {entryMissing
                  ? 'مش مسجّل'
                  : entryUnpaid
                    ? 'متسجّل ومستني تأكيد التحويل'
                    : 'متأكّد وجاهز'}
              </span>
            </p>
            {entry ? (
              <p className="text-caption text-content-faint">
                سجّلت دخولك {formatDateTimeAr(entry.createdAt)}
              </p>
            ) : null}
          </div>

          <ol className="space-y-2 text-sub text-content-sub">
            <li>1 — سجّل دخولك في المزاد (ده التزام، مش دفع).</li>
            <li>2 — حوّل الرسوم بالتحويل البنكي أو انستاباي.</li>
            <li>3 — ارفع صورة الإيصال من صفحة الرسوم والفواتير.</li>
            <li>4 — CarQ بتأكّد التحويل، والمزايدة بتتفتح على طول.</li>
          </ol>

          {/*
            لما بوابة دفع حقيقية تتركّب (Paymob/Fawry)، الخطوتين ٢ و٣ بيتحوّلوا
            لزرار واحد — باقي الشاشة زي ما هي.
          */}
          <p className="text-caption text-content-faint">
            مابنقولش «تم الدفع» قبل ما موظف CarQ يأكّد التحويل فعلًا.
          </p>
        </div>
      </Dialog>
    </>
  );
}
