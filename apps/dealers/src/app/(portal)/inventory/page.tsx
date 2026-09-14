'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  CheckCircle2,
  EyeOff,
  Gavel,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  FileDrop,
  IconButton,
  PageHeader,
  Select,
  Sheet,
  Tabs,
  formatEGP,
  formatKm,
  formatPct,
  useToast,
  withThousands,
  type Column,
  type TabDef,
} from '@carq/ui';
import {
  errorMessage,
  useDealerAuctions,
  useDeleteListing,
  useMarkListingSold,
  useMyLeads,
  useMyListings,
  useReactivateListing,
  useRenewListing,
  useUploadListingPhoto,
  type Listing,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/inventory` — عربياتي (EXHIBITION_PORTAL_SPEC §4.2)
 *
 * الفخ الأول لازم يتعرض صراحة: **`draft` معناها محدش شايف العربية**.
 * الإعلان بيتولد `draft` وأول صورة هي اللي بتفعّله (D-2) — والمعرض
 * بيفتكر إنه نشر. فالصف بياخد شارة حمرا «مخفية — محتاجة صورة» وزرار
 * رفع مباشر، وعمره ما بيتعرض كـ«نشطة».
 * ════════════════════════════════════════════════════════════════
 */

const STATUS_LABELS: Record<Listing['status'], string> = {
  draft: 'مخفية (مسودة)',
  active: 'نشطة',
  reserved: 'محجوزة',
  sold: 'متباعة',
  expired: 'منتهية',
  removed: 'متشالة',
  rejected: 'مرفوضة',
};

const TABS: Array<{ key: string; label: string; match: (l: Listing) => boolean }> = [
  { key: 'all', label: 'الكل', match: () => true },
  { key: 'active', label: 'نشطة', match: (l) => l.status === 'active' },
  { key: 'draft', label: 'مخفية', match: (l) => l.status === 'draft' },
  { key: 'reserved', label: 'محجوزة', match: (l) => l.status === 'reserved' },
  { key: 'sold', label: 'متباعة', match: (l) => l.status === 'sold' },
  { key: 'expired', label: 'منتهية', match: (l) => l.status === 'expired' },
  {
    key: 'gone',
    label: 'متشالة ومرفوضة',
    match: (l) => l.status === 'removed' || l.status === 'rejected',
  },
];

const PRICE_FILTERS = [
  { value: 'all', label: 'السعر مقابل السوق: الكل' },
  { value: 'high', label: 'فوق السوق' },
  { value: 'fair', label: 'في السعر' },
  { value: 'deal', label: 'تحت السوق' },
  { value: 'unpriced', label: 'مش متسعّرة' },
];

/** فرق السعر عن متوسط السوق — `null` معناها «مش متسعّرة» مش صفر (P-4) */
function marketGap(l: Listing): number | null {
  if (l.marketAvg === null) return null;
  return ((l.price - l.marketAvg) / l.marketAvg) * 100;
}

export default function InventoryPage() {
  const router = useRouter();
  const toast = useToast();

  const listings = useMyListings();
  const leads = useMyLeads();
  const auctions = useDealerAuctions('all');

  const markSold = useMarkListingSold();
  const reactivate = useReactivateListing();
  const renew = useRenewListing();
  const remove = useDeleteListing();
  const uploadPhoto = useUploadListingPhoto();

  const [tab, setTab] = useState('all');
  const [make, setMake] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');

  const [soldTarget, setSoldTarget] = useState<Listing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [photoTarget, setPhotoTarget] = useState<Listing | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);

  const all = useMemo(() => listings.data ?? [], [listings.data]);

  /** عدد الاستفسارات لكل إعلان — من غير نداء لكل صف */
  const leadsByListing = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of leads.data ?? []) {
      map.set(t.listing.id, (map.get(t.listing.id) ?? 0) + 1);
    }
    return map;
  }, [leads.data]);

  /** العربيات اللي عليها مزاد **شغال** — دي بس اللي التعديل عليها مقيّد (L-7) */
  const inAuction = useMemo(
    () =>
      new Set(
        (auctions.data ?? []).filter((a) => a.status === 'live').map((a) => a.listing.id),
      ),
    [auctions.data],
  );

  const makes = useMemo(
    () => Array.from(new Set(all.map((l) => l.make))).sort((a, b) => a.localeCompare(b, 'ar')),
    [all],
  );

  const rows = useMemo(() => {
    const tabDef = TABS.find((t) => t.key === tab) ?? TABS[0]!;
    return all.filter((l) => {
      if (!tabDef.match(l)) return false;
      if (make !== 'all' && l.make !== make) return false;
      if (priceFilter !== 'all') {
        const gap = marketGap(l);
        if (priceFilter === 'unpriced' && gap !== null) return false;
        if (priceFilter === 'high' && (gap === null || gap <= 8)) return false;
        if (priceFilter === 'fair' && (gap === null || Math.abs(gap) > 8)) return false;
        if (priceFilter === 'deal' && (gap === null || gap >= -8)) return false;
      }
      return true;
    });
  }, [all, tab, make, priceFilter]);

  const draftCount = useMemo(() => all.filter((l) => l.status === 'draft').length, [all]);

  const tabs: TabDef[] = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: all.filter(t.match).length,
    alert: t.key === 'draft',
  }));

  const onRenew = (l: Listing) => {
    renew.mutate(
      { id: l.id },
      {
        onSuccess: () =>
          toast({
            tone: 'ok',
            title: 'الإعلان اتجدّد',
            body: `${l.title} ${l.year} هيفضل معروض ٣٠ يوم كمان من النهاردة.`,
          }),
        onError: (e) => toast({ tone: 'crit', title: 'التجديد مانفعش', body: errorMessage(e) }),
      },
    );
  };

  /** L-13: البيعة اتفكّت — الإعلان بيرجع نشط بنفس بياناته */
  const onReactivate = (l: Listing) => {
    reactivate.mutate(
      { id: l.id },
      {
        onSuccess: () =>
          toast({
            tone: 'ok',
            title: 'رجعت للبيع',
            body: `${l.title} ${l.year} بقت نشطة تاني وظاهرة في السوق.`,
          }),
        onError: (e) =>
          toast({ tone: 'crit', title: 'مقدرناش نرجّعها', body: errorMessage(e) }),
      },
    );
  };

  const columns: Array<Column<Listing>> = [
    {
      key: 'image',
      header: 'صورة',
      width: 84,
      value: (l) => (l.imageUrl ? 'فيه' : 'مفيش'),
      render: (l) =>
        l.imageUrl ? (
          // صور محلية في public/cars — img عادي مش next/image
          <img
            src={l.imageUrl}
            alt=""
            className="h-11 w-16 rounded-xs border border-line object-cover"
          />
        ) : (
          <span className="flex h-11 w-16 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
            <Car className="h-5 w-5" />
          </span>
        ),
    },
    {
      key: 'title',
      header: 'العربية',
      sortable: true,
      value: (l) => `${l.title} ${l.year}`,
      render: (l) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-content">{l.title}</p>
          <p className="mt-0.5 text-caption text-content-sub">
            {l.governorate} · {l.area}
          </p>
        </div>
      ),
    },
    {
      key: 'year',
      header: 'السنة',
      width: 72,
      sortable: true,
      value: (l) => l.year,
      render: (l) => <span className="tnum">{l.year}</span>,
    },
    {
      key: 'price',
      header: 'السعر',
      sortable: true,
      value: (l) => l.price,
      render: (l) => <span className="tnum whitespace-nowrap">{formatEGP(l.price)}</span>,
    },
    {
      key: 'gap',
      header: 'مقابل السوق',
      sortable: true,
      hideBelow: 'md',
      value: (l) => marketGap(l) ?? 0,
      render: (l) => {
        const gap = marketGap(l);
        if (gap === null)
          return (
            <Badge tone="neutral" icon={<EyeOff />}>
              مش متسعّرة
            </Badge>
          );
        const tone = gap > 8 ? 'warn' : gap < -8 ? 'ok' : 'neutral';
        return (
          <span className="tnum text-sub font-bold">
            <Badge tone={tone}>{formatPct(gap, 0)}</Badge>
          </span>
        );
      },
    },
    {
      key: 'km',
      header: 'العداد',
      sortable: true,
      hideBelow: 'lg',
      value: (l) => l.km,
      render: (l) => <span className="tnum whitespace-nowrap">{formatKm(l.km)}</span>,
    },
    {
      key: 'views',
      header: 'مشاهدات',
      align: 'center',
      sortable: true,
      hideBelow: 'lg',
      value: (l) => l.viewsCount,
      render: (l) => <span className="tnum">{withThousands(l.viewsCount)}</span>,
    },
    {
      key: 'leads',
      header: 'استفسارات',
      align: 'center',
      sortable: true,
      hideBelow: 'xl',
      value: (l) => leadsByListing.get(l.id) ?? 0,
      render: (l) => <span className="tnum">{withThousands(leadsByListing.get(l.id) ?? 0)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      sortable: true,
      value: (l) => STATUS_LABELS[l.status],
      render: (l) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {l.status === 'draft' ? (
            <>
              {/* فخ ١: مخفية معناها محدش شايفها — ممنوع تتعرض كـ«نشطة» (D-2) */}
              <Badge tone="crit" icon={<EyeOff />}>
                مخفية — محتاجة صورة
              </Badge>
              <Button
                variant="primary"
                size="sm"
                icon={<ImagePlus />}
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoName(null);
                  setPhotoTarget(l);
                }}
              >
                ارفع صورة
              </Button>
            </>
          ) : (
            <Badge
              tone={
                l.status === 'active'
                  ? 'ok'
                  : l.status === 'sold'
                    ? 'ink'
                    : l.status === 'reserved'
                      ? 'accent'
                      : l.status === 'rejected'
                        ? 'crit'
                        : 'neutral'
              }
            >
              {STATUS_LABELS[l.status]}
            </Badge>
          )}
          {inAuction.has(l.id) ? (
            <Badge tone="accent" icon={<Gavel />}>
              في مزاد
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'أكشنات',
      align: 'end',
      width: 190,
      value: () => '',
      render: (l) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton
            label="تعديل"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/inventory/${l.id}`);
            }}
          >
            <Pencil className="h-[18px] w-[18px]" />
          </IconButton>
          {l.status === 'sold' ? (
            /* L-13: «اتباعت» مش نهائية — بترجع نشطة بنفس بياناتها */
            <IconButton
              label="رجّعها للبيع"
              onClick={(e) => {
                e.stopPropagation();
                onReactivate(l);
              }}
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </IconButton>
          ) : (
            <IconButton
              label="تعليم متباع"
              onClick={(e) => {
                e.stopPropagation();
                setSoldTarget(l);
              }}
            >
              <CheckCircle2 className="h-[18px] w-[18px]" />
            </IconButton>
          )}
          <IconButton
            label="تجديد ٣٠ يوم"
            onClick={(e) => {
              e.stopPropagation();
              onRenew(l);
            }}
          >
            <RefreshCw className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton
            label="حذف"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(l);
            }}
            className="hover:!text-crit"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="عربياتي"
        subtitle="مخزون المعرض كله — اللي ظاهر للناس واللي مخفي ومحتاج صورة"
        motif="oval"
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
      >
        <Tabs tabs={tabs} value={tab} onChange={setTab} onDark />
      </PageHeader>

      <Sheet>
        {/* ───── فخ ١ معروض صراحة فوق الجدول ───── */}
        {draftCount > 0 ? (
          <Banner
            tone="crit"
            icon={<EyeOff />}
            title={`${withThousands(draftCount)} عربية مخفية — محدش شايفها خالص`}
            action={
              <Button variant="danger" size="sm" onClick={() => setTab('draft')}>
                وريهملي
              </Button>
            }
            className="mb-6"
          >
            الإعلان من غير صور بيفضل مسودة، ومش بيظهر في السوق ولا في صفحة المعرض. أول صورة هي
            اللي بتنشره — ارفع صورة واحدة وهيبقى نشط على طول.
          </Banner>
        ) : null}

        <DataTable
          caption="جدول المخزون"
          rows={rows}
          columns={columns}
          rowKey={(l) => l.id}
          loading={listings.isLoading}
          error={listings.isError ? errorMessage(listings.error) : undefined}
          onRetry={() => listings.refetch()}
          onRowClick={(l) => router.push(`/inventory/${l.id}`)}
          rowTone={(l) => (l.status === 'draft' ? 'crit' : undefined)}
          searchable
          searchPlaceholder="دوّر بالماركة أو الموديل أو المحافظة…"
          exportName="carq-inventory"
          emptyTitle="مفيش عربيات في العرض ده"
          emptyHint="غيّر التبويب أو الفلاتر، أو ضيف أول عربية في المعرض."
          emptyAction={
            <Button variant="primary" icon={<Plus />} onClick={() => router.push('/inventory/new')}>
              ضيف عربية
            </Button>
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="h-10 w-[168px] text-sub"
                aria-label="الماركة"
              >
                <option value="all">كل الماركات</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select
                value={priceFilter}
                onChange={(e) => setPriceFilter(e.target.value)}
                className="h-10 w-[210px] text-sub"
                aria-label="السعر مقابل السوق"
              >
                {PRICE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
      </Sheet>

      {/* ───── رفع أول صورة — ده اللي بيفعّل الإعلان (D-2) ───── */}
      <Dialog
        open={photoTarget !== null}
        onClose={() => setPhotoTarget(null)}
        title="ارفع أول صورة"
        subtitle={
          photoTarget ? `${photoTarget.title} ${photoTarget.year} — مخفية دلوقتي` : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPhotoTarget(null)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              disabled={!photoName}
              loading={uploadPhoto.isPending}
              onClick={() => {
                if (!photoTarget) return;
                uploadPhoto.mutate(
                  { id: photoTarget.id },
                  {
                    onSuccess: () => {
                      toast({
                        tone: 'ok',
                        title: 'الإعلان بقى نشط',
                        body: 'الصورة اترفعت والعربية ظهرت في السوق وفي صفحة المعرض.',
                      });
                      setPhotoTarget(null);
                    },
                    onError: (e) =>
                      toast({ tone: 'crit', title: 'الرفع مانفعش', body: errorMessage(e) }),
                  },
                );
              }}
            >
              ارفع وفعّل الإعلان
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sub text-content-sub">
            العربية دي مسودة، يعني مش ظاهرة لحد. أول صورة بتنشرها فورًا وتخليها نشطة لمدة ٣٠ يوم.
          </p>
          <FileDrop
            label="اختار صورة العربية"
            hint="JPG أو PNG — الصورة الأولى هي اللي بتظهر في نتايج البحث"
            accept="image/*"
            fileName={photoName}
            onPick={(f) => setPhotoName(f.name)}
            icon={<ImagePlus />}
          />
        </div>
      </Dialog>

      {/* ───── تعليم متباع ───── */}
      <ConfirmDialog
        open={soldTarget !== null}
        onClose={() => setSoldTarget(null)}
        title="تعليم العربية متباعة"
        impact={
          soldTarget
            ? `${soldTarget.title} ${soldTarget.year} هتتشال من السوق وهتتعلّم متباعة. لو اتباعت بالغلط تقدر ترجّعها من صفحة العربية.`
            : ''
        }
        confirmLabel="علّمها متباعة"
        tone="accent"
        requireReason={false}
        loading={markSold.isPending}
        onConfirm={() => {
          if (!soldTarget) return;
          markSold.mutate(
            { id: soldTarget.id },
            {
              onSuccess: () => {
                toast({ tone: 'ok', title: 'اتعلّمت متباعة', body: 'مبروك البيعة.' });
                setSoldTarget(null);
              },
              onError: (e) =>
                toast({ tone: 'crit', title: 'مانفعش', body: errorMessage(e) }),
            },
          );
        }}
      />

      {/* ───── حذف ───── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="حذف الإعلان"
        impact={
          deleteTarget
            ? `${deleteTarget.title} ${deleteTarget.year} هتختفي من السوق ومن صفحة المعرض، والاستفسارات اللي عليها مش هتوصلك تاني.`
            : ''
        }
        confirmLabel="احذف"
        tone="crit"
        requireReason={false}
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(
            { id: deleteTarget.id },
            {
              onSuccess: () => {
                toast({ tone: 'ok', title: 'الإعلان اتحذف' });
                setDeleteTarget(null);
              },
              onError: (e) => toast({ tone: 'crit', title: 'مانفعش', body: errorMessage(e) }),
            },
          );
        }}
      />
    </>
  );
}
