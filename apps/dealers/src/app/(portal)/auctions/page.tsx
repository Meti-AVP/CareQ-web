'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  CheckCircle2,
  Clock3,
  Crown,
  FileSignature,
  Gavel,
  Lock,
  Store,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Countdown,
  DataTable,
  PageHeader,
  Pill,
  SectionHeader,
  Select,
  Sheet,
  formatEGP,
  formatKm,
  secondsUntil,
  useToast,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  useCatalogMakes,
  useCreateEntry,
  useDealerAuctions,
  useMyBids,
  useMyExhibition,
  type Auction,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/auctions` — المزادات المتاحة (EXHIBITION_PORTAL_SPEC §4.4)
 *
 * قواعد الشاشة دي:
 *  · **العداد بيتحسب من `endsAt` بتاع السيرفر في كل تكة** (A-6) —
 *    مش رقم بينقص محليًا. مكوّن `Countdown` بيعمل ده، فمفيش عداد محلي هنا.
 *  · **حالة دخولك ٣ حالات مستقلة** (مش مسجّل · مستني الدفع · جاهز)
 *    بـ٣ ألوان و٣ أيقونات — كل واحدة ليها خطوة جاية مختلفة (§5).
 *  · «ادخل المزاد» بيسجّل **الالتزام بس** — مش تحصيل فلوس (§4.6).
 *    ممنوع نقول «تم الدفع» وإحنا مستنيين تأكيد بشري.
 * ════════════════════════════════════════════════════════════════
 */

/** مدى السعر — على سعر الإعلان، مش على المزايدة الحالية */
const PRICE_RANGES = [
  { value: 'all', label: 'كل الأسعار', min: 0, max: Infinity },
  { value: 'lt500', label: 'أقل من 500 ألف', min: 0, max: 500_000 },
  { value: '500-1m', label: '500 ألف – مليون', min: 500_000, max: 1_000_000 },
  { value: '1-2m', label: 'مليون – 2 مليون', min: 1_000_000, max: 2_000_000 },
  { value: 'gt2m', label: 'أكتر من 2 مليون', min: 2_000_000, max: Infinity },
];

/** «قرب الانتهاء» = باقي أقل من ساعتين */
const ENDING_SOON_SECONDS = 2 * 3600;

function CarCell({ auction }: { auction: Auction }) {
  const { listing } = auction;
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted-soft">
        {listing.imageUrl ? (
          // الصور محلية في public/cars — img عادي مش next/image
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Car className="h-5 w-5 text-content-faint" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sub font-bold text-content">{listing.title}</span>
        <span className="block text-caption text-content-faint">{listing.governorate}</span>
      </span>
    </div>
  );
}

/** حالة دخولك — ٣ حالات، ٣ ألوان، ٣ أيقونات (§4.4) */
function EntryState({ auction }: { auction: Auction }) {
  if (!auction.myEntry)
    return (
      <Badge tone="crit" icon={<Lock />}>
        مش مسجّل
      </Badge>
    );
  if (!auction.myEntry.paid)
    return (
      <Badge tone="warn" icon={<Clock3 />}>
        مستني تأكيد الدفع
      </Badge>
    );
  return (
    <Badge tone="ok" icon={<CheckCircle2 />}>
      جاهز للمزايدة
    </Badge>
  );
}

export default function AuctionsPage() {
  const router = useRouter();
  const toast = useToast();

  const auctionsQ = useDealerAuctions('live');
  const exhibitionQ = useMyExhibition();
  const myBidsQ = useMyBids();
  const makesQ = useCatalogMakes();
  const createEntry = useCreateEntry();

  const [make, setMake] = useState('all');
  const [governorate, setGovernorate] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [endingSoon, setEndingSoon] = useState(false);
  const [enteredOnly, setEnteredOnly] = useState(false);

  const auctions = useMemo(() => auctionsQ.data ?? [], [auctionsQ.data]);
  const exhibition = exhibitionQ.data;

  /**
   * «إنت الأعلى؟» من غير نداء لكل صف: مزايداتي بتيجي مرة واحدة،
   * وأعلى مزايدة ليّا في المزاد لو ساوت `currentBid` يبقى أنا آخر مزايد.
   */
  const myTopByAuction = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of myBidsQ.data ?? []) {
      const cur = map.get(b.auctionId) ?? 0;
      if (b.amount > cur) map.set(b.auctionId, b.amount);
    }
    return map;
  }, [myBidsQ.data]);

  const isMyTop = (a: Auction) =>
    a.bidsCount > 0 && (myTopByAuction.get(a.id) ?? 0) === a.currentBid;

  const governorates = useMemo(
    () =>
      Array.from(new Set(auctions.map((a) => a.listing.governorate))).sort((x, y) =>
        x.localeCompare(y, 'ar'),
      ),
    [auctions],
  );

  const rows = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.value === priceRange) ?? PRICE_RANGES[0]!;
    return auctions.filter((a) => {
      // العنوان جاي «الماركة الموديل السنة» — الفلتر على بداية العنوان
      if (make !== 'all' && !a.listing.title.startsWith(`${make} `)) return false;
      if (governorate !== 'all' && a.listing.governorate !== governorate) return false;
      if (a.listing.price < range.min || a.listing.price > range.max) return false;
      if (endingSoon) {
        const left = secondsUntil(a.endsAt);
        if (left === 0 || left > ENDING_SOON_SECONDS) return false;
      }
      if (enteredOnly && !a.myEntry) return false;
      return true;
    });
  }, [auctions, make, governorate, priceRange, endingSoon, enteredOnly]);

  const enterAuction = (auction: Auction) => {
    createEntry.mutate(
      { auctionId: auction.id },
      {
        onSuccess: () =>
          toast({
            title: 'سجّلنا دخولك في المزاد',
            // أمانة الشاشة (§4.6): مفيش «تم الدفع» قبل تأكيد بشري
            body: 'دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل.',
            tone: 'ok',
          }),
        onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
      },
    );
  };

  const columns: Array<Column<Auction>> = [
    {
      key: 'car',
      header: 'العربية',
      width: 250,
      value: (a) => a.listing.title,
      render: (a) => <CarCell auction={a} />,
    },
    {
      key: 'specs',
      header: 'السنة والعداد والمحافظة',
      hideBelow: 'lg',
      value: (a) => a.listing.km,
      render: (a) => (
        <span className="block text-caption text-content-sub">
          {a.listing.year} · {formatKm(a.listing.km)} · {a.listing.governorate}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'سعر الإعلان',
      align: 'end',
      sortable: true,
      hideBelow: 'xl',
      value: (a) => a.listing.price,
      render: (a) => <span className="tnum text-content-sub">{formatEGP(a.listing.price)}</span>,
    },
    {
      key: 'startPrice',
      header: 'سعر البداية (85٪)',
      align: 'end',
      sortable: true,
      hideBelow: 'xl',
      value: (a) => a.startPrice,
      render: (a) => <span className="tnum text-content-sub">{formatEGP(a.startPrice)}</span>,
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
      key: 'bidsCount',
      header: 'عدد المزايدات',
      align: 'center',
      sortable: true,
      hideBelow: 'md',
      value: (a) => a.bidsCount,
      render: (a) => <span className="tnum text-content-sub">{withThousands(a.bidsCount)}</span>,
    },
    {
      key: 'top',
      header: 'إنت الأعلى؟',
      align: 'center',
      sortable: true,
      value: (a) => (isMyTop(a) ? 1 : 0),
      render: (a) =>
        isMyTop(a) ? (
          <Badge tone="ok" icon={<Crown />}>
            إنت الأعلى
          </Badge>
        ) : (myTopByAuction.get(a.id) ?? 0) > 0 ? (
          <Badge tone="crit" icon={<Trophy />}>
            اتخطّيت
          </Badge>
        ) : (
          <span className="text-caption text-content-faint">مازايدتش</span>
        ),
    },
    {
      key: 'entry',
      header: 'حالة دخولك',
      align: 'center',
      value: (a) => (!a.myEntry ? 0 : a.myEntry.paid ? 2 : 1),
      render: (a) => <EntryState auction={a} />,
    },
    {
      key: 'endsAt',
      header: 'الوقت المتبقي',
      align: 'end',
      sortable: true,
      value: (a) => secondsUntil(a.endsAt),
      render: (a) => <Countdown endsAt={a.endsAt} size="sm" />,
    },
    {
      key: 'action',
      header: '',
      align: 'end',
      width: 150,
      render: (a) => {
        // A-7: عربيتك — مفيش دخول ولا مزايدة
        if (exhibition && a.sellerId === exhibition.userId)
          return (
            <Badge tone="neutral" icon={<Store />}>
              عربيتك
            </Badge>
          );
        if (!a.myEntry)
          return (
            <Button
              size="sm"
              variant="ink"
              icon={<Gavel />}
              loading={createEntry.isPending && createEntry.variables?.auctionId === a.id}
              onClick={(e) => {
                e.stopPropagation();
                enterAuction(a);
              }}
            >
              ادخل المزاد
            </Button>
          );
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/auctions/${a.id}`);
            }}
          >
            افتح الغرفة
          </Button>
        );
      },
    },
  ];

  const readyCount = rows.filter((a) => a.myEntry?.paid).length;

  return (
    <>
      <PageHeader
        title="المزادات المتاحة"
        subtitle="كل مزاد شغال دلوقتي — سعر البداية 85٪ من سعر الإعلان، والعداد من السيرفر"
        motif="swoosh"
        actions={
          <Button
            variant="white"
            size="sm"
            icon={<Trophy />}
            onClick={() => router.push('/auctions/mine')}
          >
            مزاداتي
          </Button>
        }
      />

      <Sheet>
        {/* الشرط الأول من ثلاثة (A-1): من غير تعاقد، المزايدة مقفولة — والسبب بيتشرح */}
        {exhibition && !exhibition.isContracted ? (
          <Banner
            tone="warn"
            icon={<FileSignature />}
            title="معرضك مش متعاقد — المزايدة مقفولة"
            action={
              <Button variant="outline" size="sm" onClick={() => router.push('/contract')}>
                اعرف التفاصيل
              </Button>
            }
            className="mb-6"
          >
            تقدر تتفرّج على المزادات وتسجّل دخولك، بس المزايدة نفسها مش هتشتغل غير لما العقد يبقى
            ساري. التعاقد خطوة منفصلة عن توثيق المعرض.
          </Banner>
        ) : null}

        <SectionHeader
          title="فلترة المزادات"
          hint="الفلاتر شغالة على الصفحة — الأرقام والعدادات بتتحدّث من السيرفر كل 15 ثانية"
        />

        <Card className="mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[150px] flex-1">
              <span className="mb-1.5 block text-caption font-bold text-content-sub">الماركة</span>
              <Select value={make} onChange={(e) => setMake(e.target.value)}>
                <option value="all">كل الماركات</option>
                {(makesQ.data ?? []).map((mk) => (
                  <option key={mk} value={mk}>
                    {mk}
                  </option>
                ))}
              </Select>
            </label>

            <label className="min-w-[150px] flex-1">
              <span className="mb-1.5 block text-caption font-bold text-content-sub">المحافظة</span>
              <Select value={governorate} onChange={(e) => setGovernorate(e.target.value)}>
                <option value="all">كل المحافظات</option>
                {governorates.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </label>

            <label className="min-w-[150px] flex-1">
              <span className="mb-1.5 block text-caption font-bold text-content-sub">مدى السعر</span>
              <Select value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
                {PRICE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Pill active={endingSoon} onClick={() => setEndingSoon((v) => !v)}>
                <Timer className="h-4 w-4" />
                قرب الانتهاء
              </Pill>
              <Pill active={enteredOnly} onClick={() => setEnteredOnly((v) => !v)}>
                <Gavel className="h-4 w-4" />
                اللي أنا داخل فيه بس
              </Pill>
            </div>
          </div>

          <p className="mt-4 border-t border-line pt-3 text-caption text-content-sub">
            {withThousands(rows.length)} مزاد شغال · {withThousands(readyCount)} منهم دخولك فيه
            متأكّد وجاهز للمزايدة
          </p>
        </Card>

        <DataTable
          caption="جدول المزادات"
          rows={rows}
          columns={columns}
          rowKey={(a) => a.id}
          loading={auctionsQ.isLoading}
          error={auctionsQ.isError ? errorMessage(auctionsQ.error) : undefined}
          onRetry={() => auctionsQ.refetch()}
          emptyTitle="مفيش مزادات مطابقة"
          emptyHint="جرّب تشيل شوية فلاتر — المزادات الشغالة بتتغيّر على مدار اليوم."
          onRowClick={(a) => router.push(`/auctions/${a.id}`)}
          rowTone={(a) => {
            const left = secondsUntil(a.endsAt);
            if (left === 0) return 'crit';
            return left <= 120 ? 'warn' : undefined;
          }}
          searchable
          searchPlaceholder="دوّر بالعربية أو المحافظة…"
          exportName="carq-auctions"
        />
      </Sheet>
    </>
  );
}
