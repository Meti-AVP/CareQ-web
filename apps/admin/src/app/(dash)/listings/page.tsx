'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Car,
  CheckCircle2,
  Clock,
  EyeOff,
  ImageOff,
  Minus,
  RotateCcw,
  ShieldCheck,
  TimerOff,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  PageHeader,
  Pill,
  Select,
  Sheet,
  Tabs,
  formatDateAr,
  formatEGP,
  formatKm,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useBreakdown,
  useListings,
  useOverview,
  type Listing,
  type ListingStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/listings` — الإعلانات والمراجعة (ADMIN_DASHBOARD_SPEC §4.3)
 *
 * الموبايل بيشوف `active | sold` بس لأن الباك بيـ«يسقّط» الحالات
 * عليهم (L-5). **الداشبورد لازم تشوف السبعة كاملين** — من غير كده
 * الإعلانات المحبوسة والمرفوضة بتختفي من عين اللي بيراجع.
 *
 * صفوف `draft` متعلّمة بلون تحذير: الإعلان بينشر `draft` و**أول صورة
 * هي اللي بتفعّله** (D-2) — يعني الصف الأصفر ده إعلان محدش شايفه.
 * ════════════════════════════════════════════════════════════════
 */

const STATUS_META: Record<ListingStatus, { label: string; tone: Tone; Icon: typeof Car }> = {
  draft: { label: 'مسودة', tone: 'warn', Icon: EyeOff },
  active: { label: 'نشطة', tone: 'ok', Icon: CheckCircle2 },
  reserved: { label: 'محجوزة', tone: 'accent', Icon: Clock },
  sold: { label: 'متباعة', tone: 'ink', Icon: BadgeCheck },
  expired: { label: 'منتهية', tone: 'neutral', Icon: TimerOff },
  removed: { label: 'متشالة', tone: 'neutral', Icon: Trash2 },
  rejected: { label: 'مرفوضة', tone: 'crit', Icon: XCircle },
};

const STATUS_ORDER: ListingStatus[] = [
  'draft',
  'active',
  'reserved',
  'sold',
  'expired',
  'removed',
  'rejected',
];

const TAG_META = {
  deal: { label: 'لقطة', tone: 'ok' as Tone, Icon: TrendingDown },
  fair: { label: 'سعر عادل', tone: 'neutral' as Tone, Icon: Minus },
  high: { label: 'أعلى من السوق', tone: 'warn' as Tone, Icon: TrendingUp },
};

type Filters = NonNullable<Parameters<typeof useListings>[0]>;

const toNumber = (v: string): number | undefined => {
  const digits = v.replace(/[^\d]/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isNaN(n) ? undefined : n;
};

export default function ListingsPage() {
  const router = useRouter();

  const [status, setStatus] = useState<ListingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [make, setMake] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [kmVerified, setKmVerified] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);
  const [unpriced, setUnpriced] = useState(false);

  /** الصفحات بالـcursor — مكدّس عشان زرار «السابق» يشتغل صح */
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);

  const resetPage = () => {
    setCursor(null);
    setTrail([]);
  };

  /** البحث بيتأخر ٣٠٠ ملي عشان مايضربش نداء مع كل حرف */
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setCursor(null);
      setTrail([]);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query: Filters = useMemo(
    () => ({
      status,
      q: q || undefined,
      make: make || undefined,
      governorate: governorate || undefined,
      priceMin: toNumber(priceMin),
      priceMax: toNumber(priceMax),
      yearMin: toNumber(yearMin),
      yearMax: toNumber(yearMax),
      kmVerified: kmVerified ? true : undefined,
      inspected: inspected ? true : undefined,
      // «من غير صور» = photosCount صفر
      hasPhotos: noPhotos ? false : undefined,
      // «مش متسعّر» = marketAvg بـnull (P-4)
      priced: unpriced ? false : undefined,
      cursor,
    }),
    [
      status,
      q,
      make,
      governorate,
      priceMin,
      priceMax,
      yearMin,
      yearMax,
      kmVerified,
      inspected,
      noPhotos,
      unpriced,
      cursor,
    ],
  );

  const listings = useListings(query);
  const overview = useOverview();
  const makes = useBreakdown('make');
  const governorates = useBreakdown('governorate');

  const rows = listings.data?.items ?? [];
  const total = listings.data?.total ?? 0;
  /** بداية الصفحة من عمق المكدس — الـcursor الحقيقي غامق ومايتفسّرش كرقم */
  const start = trail.length * 25;

  const counts = overview.data?.listings;
  const tabs: TabDef[] = useMemo(() => {
    const all = counts ? STATUS_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0) : undefined;
    return [
      { key: 'all', label: 'الكل', count: all },
      ...STATUS_ORDER.map((k) => ({
        key: k,
        label: STATUS_META[k].label,
        count: counts?.[k],
        // المسودة مؤشر إنذار مش رقم عادي — إعلان محبوس محدش شايفه
        alert: k === 'draft' && (counts?.draft ?? 0) > 0,
      })),
    ];
  }, [counts]);

  const filtersOn =
    Boolean(q || make || governorate || priceMin || priceMax || yearMin || yearMax) ||
    kmVerified ||
    inspected ||
    noPhotos ||
    unpriced;

  const clearFilters = () => {
    setSearch('');
    setQ('');
    setMake('');
    setGovernorate('');
    setPriceMin('');
    setPriceMax('');
    setYearMin('');
    setYearMax('');
    setKmVerified(false);
    setInspected(false);
    setNoPhotos(false);
    setUnpriced(false);
    resetPage();
  };

  const draftsInView = rows.filter((l) => l.status === 'draft').length;

  const columns: Array<Column<Listing>> = [
    {
      key: 'image',
      header: 'صورة',
      width: 84,
      value: (l) => (l.imageUrl ? 'فيه صورة' : 'من غير صور'),
      render: (l) =>
        l.imageUrl ? (
          // الصور محلية في public/cars — img عادي مش next/image
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.imageUrl}
            alt={l.title}
            loading="lazy"
            className="h-11 w-16 rounded-xs object-cover"
          />
        ) : (
          <span className="flex h-11 w-16 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
            <Car className="h-4 w-4" />
          </span>
        ),
    },
    {
      key: 'title',
      header: 'العنوان',
      sortable: true,
      value: (l) => l.title,
      render: (l) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-content">{l.title}</p>
          <p className="truncate text-caption text-content-sub">
            {l.area} · {l.transmission}
          </p>
        </div>
      ),
    },
    {
      key: 'car',
      header: 'الماركة والموديل والسنة',
      hideBelow: 'lg',
      value: (l) => `${l.make} ${l.model} ${l.year}`,
      render: (l) => (
        <span className="whitespace-nowrap">
          {l.make} {l.model} · <span className="tnum">{l.year}</span>
        </span>
      ),
    },
    {
      key: 'price',
      header: 'السعر',
      align: 'end',
      sortable: true,
      value: (l) => l.price,
      render: (l) => <span className="tnum font-bold text-content">{formatEGP(l.price)}</span>,
    },
    {
      key: 'marketAvg',
      header: 'متوسط السوق',
      align: 'end',
      sortable: true,
      hideBelow: 'lg',
      // null مش صفر: «مش متسعّر» بييجي آخر الترتيب مش وسط الأرخص (P-4)
      value: (l) => l.marketAvg,
      render: (l) =>
        l.marketAvg === null ? (
          // لا صفر ولا مخفي — شارة صريحة (P-4)
          <Badge tone="neutral" icon={<Minus />}>
            مش متسعّر
          </Badge>
        ) : (
          <span className="tnum text-content-sub">{formatEGP(l.marketAvg)}</span>
        ),
    },
    {
      key: 'priceTag',
      header: 'مؤشر السعر',
      value: (l) => (l.priceTag ? TAG_META[l.priceTag].label : 'من غير مؤشر'),
      render: (l) => {
        if (!l.priceTag) return <span className="text-content-faint">—</span>;
        const t = TAG_META[l.priceTag];
        return (
          <Badge tone={t.tone} icon={<t.Icon />}>
            {t.label}
          </Badge>
        );
      },
    },
    {
      key: 'km',
      header: 'العداد',
      align: 'end',
      sortable: true,
      hideBelow: 'lg',
      value: (l) => l.km,
      render: (l) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="tnum">{formatKm(l.km)}</span>
          {l.kmVerified ? (
            <ShieldCheck className="h-3.5 w-3.5 text-ok" aria-label="ممشى موثّق" />
          ) : null}
          {l.inspected ? <Wrench className="h-3.5 w-3.5 text-ok" aria-label="مفحوص" /> : null}
        </span>
      ),
    },
    {
      key: 'governorate',
      header: 'المحافظة',
      hideBelow: 'xl',
      value: (l) => l.governorate,
    },
    {
      key: 'seller',
      header: 'البائع',
      hideBelow: 'xl',
      value: (l) => l.seller.name,
      render: (l) => <span className="whitespace-nowrap text-content-sub">{l.seller.name}</span>,
    },
    {
      key: 'views',
      header: 'المشاهدات',
      align: 'end',
      sortable: true,
      hideBelow: 'xl',
      value: (l) => l.viewsCount,
      render: (l) => <span className="tnum text-content-sub">{withThousands(l.viewsCount)}</span>,
    },
    {
      key: 'photos',
      header: 'الصور',
      align: 'end',
      sortable: true,
      hideBelow: 'lg',
      value: (l) => l.photosCount,
      render: (l) =>
        l.photosCount === 0 ? (
          <Badge tone="crit" icon={<ImageOff />}>
            من غير صور
          </Badge>
        ) : (
          <span className="tnum text-content-sub">{l.photosCount}</span>
        ),
    },
    {
      key: 'status',
      header: 'الحالة',
      value: (l) => STATUS_META[l.status].label,
      render: (l) => {
        const m = STATUS_META[l.status];
        return (
          <Badge tone={m.tone} icon={<m.Icon />}>
            {m.label}
          </Badge>
        );
      },
    },
    {
      key: 'publishedAt',
      header: 'تاريخ النشر',
      sortable: true,
      hideBelow: 'lg',
      value: (l) => l.publishedAt ?? '',
      render: (l) =>
        l.publishedAt ? (
          <span className="whitespace-nowrap text-content-sub">{formatDateAr(l.publishedAt)}</span>
        ) : (
          <span className="whitespace-nowrap text-content-faint">لسه ما اتنشرش</span>
        ),
    },
    {
      key: 'expiresAt',
      header: 'تاريخ الانتهاء',
      sortable: true,
      hideBelow: 'xl',
      value: (l) => l.expiresAt ?? '',
      render: (l) =>
        l.expiresAt ? (
          <span className="whitespace-nowrap text-content-sub">{formatDateAr(l.expiresAt)}</span>
        ) : (
          <span className="whitespace-nowrap text-content-faint">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الإعلانات"
        subtitle="السبع حالات كاملة — الموبايل بيشوف اتنين بس، وهنا بتشوف اللي مستخبي"
        motif="underline"
      >
        <Tabs
          tabs={tabs}
          value={status}
          onChange={(k) => {
            setStatus(k as ListingStatus | 'all');
            resetPage();
          }}
          onDark
        />
      </PageHeader>

      <Sheet>
        {/* ───── الفلاتر: state محلي، والاستعلام بيروح للسيرفر ───── */}
        <Card className="mb-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="بحث" hint="العنوان أو اسم البائع أو المنطقة">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="دوّر في الإعلانات…"
              />
            </Field>

            <Field label="الماركة">
              <Select
                value={make}
                onChange={(e) => {
                  setMake(e.target.value);
                  resetPage();
                }}
              >
                <option value="">كل الماركات</option>
                {(makes.data ?? []).map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.key}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="المحافظة">
              <Select
                value={governorate}
                onChange={(e) => {
                  setGovernorate(e.target.value);
                  resetPage();
                }}
              >
                <option value="">كل المحافظات</option>
                {(governorates.data ?? []).map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.key}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="مدى السعر (ج.م)">
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(e) => {
                    setPriceMin(e.target.value);
                    resetPage();
                  }}
                  placeholder="من"
                  className="tnum"
                />
                <span className="text-content-faint">—</span>
                <Input
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(e) => {
                    setPriceMax(e.target.value);
                    resetPage();
                  }}
                  placeholder="لحد"
                  className="tnum"
                />
              </div>
            </Field>

            <Field label="مدى السنة">
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  value={yearMin}
                  onChange={(e) => {
                    setYearMin(e.target.value);
                    resetPage();
                  }}
                  placeholder="من"
                  className="tnum"
                />
                <span className="text-content-faint">—</span>
                <Input
                  inputMode="numeric"
                  value={yearMax}
                  onChange={(e) => {
                    setYearMax(e.target.value);
                    resetPage();
                  }}
                  placeholder="لحد"
                  className="tnum"
                />
              </div>
            </Field>

            <Field label="فلاتر المراجعة" hint="الأربعة دول بيطلّعوا الإعلانات اللي محتاجة قرار">
              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  active={kmVerified}
                  onClick={() => {
                    setKmVerified((v) => !v);
                    resetPage();
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                  ممشى موثّق
                </Pill>
                <Pill
                  active={inspected}
                  onClick={() => {
                    setInspected((v) => !v);
                    resetPage();
                  }}
                >
                  <Wrench className="h-4 w-4" />
                  مفحوص
                </Pill>
                <Pill
                  active={noPhotos}
                  onClick={() => {
                    setNoPhotos((v) => !v);
                    resetPage();
                  }}
                >
                  <ImageOff className="h-4 w-4" />
                  من غير صور
                </Pill>
                <Pill
                  active={unpriced}
                  onClick={() => {
                    setUnpriced((v) => !v);
                    resetPage();
                  }}
                >
                  <Minus className="h-4 w-4" />
                  مش متسعّر
                </Pill>
              </div>
            </Field>
          </div>

          {filtersOn ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-caption text-content-sub">
                الفلاتر بتتبعت للسيرفر — العدد اللي تحت الجدول هو النتيجة الحقيقية، مش قص محلي.
              </p>
              <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={clearFilters}>
                صفّر الفلاتر
              </Button>
            </div>
          ) : null}
        </Card>

        {/* ───── شرح الصف الأصفر قبل ما حد يسأل عنه ───── */}
        {draftsInView > 0 ? (
          <Banner
            tone="warn"
            icon={<EyeOff />}
            title={`${withThousands(draftsInView)} إعلان مسودة في الصفحة دي — محدش شايفهم`}
            className="mb-5"
          >
            الإعلان بينشر كـ«مسودة» وأول صورة هي اللي بتفعّله. الصف الأصفر معناه إعلان مقفول على
            صاحبه: مش ظاهر في التطبيق، ومفيش مشاهدات ولا رسايل. لو العدد كبير، غالبًا رفع الصور
            باظ — مش إن البايعين بطّلوا ينشروا.
          </Banner>
        ) : null}

        <DataTable
          caption="جدول الإعلانات"
          rows={rows}
          columns={columns}
          rowKey={(l) => l.id}
          loading={listings.isLoading}
          error={listings.isError ? errorMessage(listings.error) : undefined}
          onRetry={() => listings.refetch()}
          emptyTitle={filtersOn ? 'مفيش إعلانات بالفلاتر دي' : 'مفيش إعلانات في الحالة دي'}
          emptyHint={
            filtersOn
              ? 'وسّع المدى أو شيل فلتر — الفلاتر بتتجمع على بعض.'
              : 'أول ما إعلان يدخل الحالة دي هيظهر هنا.'
          }
          emptyAction={
            filtersOn ? (
              <Button variant="outline" size="sm" icon={<RotateCcw />} onClick={clearFilters}>
                صفّر الفلاتر
              </Button>
            ) : undefined
          }
          onRowClick={(l) => router.push(`/listings/${l.id}`)}
          // المسودة بتتعلّم بلون تحذير — الصف ده إعلان محدش شايفه (D-2)
          rowTone={(l) => (l.status === 'draft' ? 'warn' : undefined)}
          exportName="carq-listings"
          hasMore={Boolean(listings.data?.nextCursor)}
          canPrev={trail.length > 0}
          onNext={() => {
            setTrail((t) => [...t, cursor]);
            setCursor(listings.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            const prev = trail.length ? trail[trail.length - 1] ?? null : null;
            setTrail((t) => t.slice(0, -1));
            setCursor(prev);
          }}
          pageInfo={
            total
              ? `${withThousands(start + 1)} – ${withThousands(start + rows.length)} من ${withThousands(total)} إعلان`
              : undefined
          }
        />

        <p className="mt-4 text-caption text-content-sub">
          اضغط على أي صف تفتح تفاصيل الإعلان — منح شارتي «ممشى موثّق» و«مفحوص» بيحصل من هناك بس.
        </p>
      </Sheet>
    </>
  );
}
