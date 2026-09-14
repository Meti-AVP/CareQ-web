'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Car,
  CheckCircle2,
  Eye,
  EyeOff,
  Gavel,
  ImagePlus,
  Lock,
  MessagesSquare,
  RefreshCw,
  Save,
  ShieldCheck,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Field,
  FileDrop,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  Skeleton,
  Textarea,
  formatDateAr,
  formatEGP,
  formatKm,
  formatPct,
  useToast,
  withThousands,
  validateFile,
  ACCEPTED_IMAGE_TYPES,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useCatalog,
  useDealerAuctions,
  useDeleteListing,
  useMarkListingSold,
  useMyLeads,
  useMyListing,
  useRenewListing,
  useUpdateListing,
  useUploadListingPhoto,
} from '@carq/api-client';
import { TRANSMISSIONS, kmError, priceError, toNumber, yearError } from '@/lib/catalog';

/**
 * ════════════════════════════════════════════════════════════════
 * `/inventory/[id]` — تفاصيل العربية وتعديلها (EXHIBITION_PORTAL_SPEC §4.2)
 *
 * فخين بيتعالجوا هنا في الفورم نفسه، مش في رد السيرفر:
 *
 *  · **`L-7`** — عربية في مزاد شغال أو عليها طلب بيع حالًا مفتوح
 *    مايتغيّرش فيها السعر ولا العداد ولا السنة ولا الماركة ولا الموديل.
 *    الحقول دي بتتقفل ومكتوب جنبها السبب، بدل ما البائع يكتب ويستنى
 *    ويتردّ عليه `409` من غير ما يفهم.
 *
 *  · **`L-4`** — العداد مابينقصش أبدًا. التحقق بيحصل هنا برسالة بتقول
 *    آخر قيمة مسجّلة بالظبط — ده أشهر تلاعب في السوق، والرفض من غير
 *    شرح بيبان عشوائي.
 * ════════════════════════════════════════════════════════════════
 */

const DAY_MS = 86_400_000;

interface FormState {
  make: string;
  model: string;
  year: string;
  price: string;
  km: string;
  transmission: string;
  body: string;
  color: string;
  governorate: string;
  area: string;
  description: string;
}

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;
  const router = useRouter();
  const toast = useToast();

  const listing = useMyListing(id);
  const leads = useMyLeads();
  const auctions = useDealerAuctions('all');
  const catalog = useCatalog();

  const update = useUpdateListing();
  const markSold = useMarkListingSold();
  const renew = useRenewListing();
  const remove = useDeleteListing();
  const uploadPhoto = useUploadListingPhoto();

  const [form, setForm] = useState<FormState | null>(null);
  const [soldOpen, setSoldOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const l = listing.data;

  /**
   * الفورم بيتعبّى مرة واحدة لكل إعلان. أي refetch في الخلفية (كل focus)
   * مايمسحش اللي البائع بيكتبه دلوقتي.
   */
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!l || filledFor.current === l.id) return;
    filledFor.current = l.id;
    setForm({
      make: l.make,
      model: l.model,
      year: String(l.year),
      price: String(l.price),
      km: String(l.km),
      transmission: l.transmission,
      body: l.body,
      color: l.color,
      governorate: l.governorate,
      area: l.area,
      description: l.description,
    });
  }, [l]);

  /** مزاد شغال على العربية دي؟ (في الموك بنقارن على listing.id) */
  const auction = useMemo(
    () => (auctions.data ?? []).find((a) => a.listing.id === id) ?? null,
    [auctions.data, id],
  );

  const leadsCount = useMemo(
    () => (leads.data ?? []).filter((t) => t.listing.id === id).length,
    [leads.data, id],
  );

  /**
   * قفل `L-7`: مزاد على العربية، أو حالتها `reserved` — ودي معناها
   * عرض «بيع حالًا» متقبول ولسه الاستلام ماتمّش.
   */
  const lockedByAuction = auction !== null && auction.status === 'live';
  const lockedBySellNow = l?.status === 'reserved';
  const locked = lockedByAuction || lockedBySellNow;
  const lockReason = lockedByAuction
    ? 'العربية دي في مزاد شغال دلوقتي'
    : 'العربية دي عليها طلب بيع حالًا مفتوح';

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const priceNum = form ? toNumber(form.price) : Number.NaN;
  const yearNum = form ? toNumber(form.year) : Number.NaN;
  const kmNum = form ? toNumber(form.km) : Number.NaN;

  /** `L-4`: العداد مايقلّش عن آخر قيمة مسجّلة */
  const kmDecreased = Boolean(l) && !Number.isNaN(kmNum) && kmNum < (l?.km ?? 0);
  const errors = {
    price: locked ? undefined : priceError(priceNum),
    year: locked ? undefined : yearError(yearNum),
    km: locked
      ? undefined
      : kmDecreased
        ? `العداد مايقلّش عن آخر قيمة مسجّلة (${withThousands(l?.km ?? 0)} كم). لو فيه غلط في الرقم القديم، كلّم الدعم.`
        : kmError(kmNum),
  };
  const hasError = Object.values(errors).some(Boolean);

  const dirty = useMemo(() => {
    if (!l || !form) return false;
    return (
      form.make !== l.make ||
      form.model !== l.model ||
      toNumber(form.year) !== l.year ||
      toNumber(form.price) !== l.price ||
      toNumber(form.km) !== l.km ||
      form.transmission !== l.transmission ||
      form.body !== l.body ||
      form.color !== l.color ||
      form.governorate !== l.governorate ||
      form.area !== l.area ||
      form.description !== l.description
    );
  }, [l, form]);

  /**
   * القوايم من الكتالوج — ولحد ما يوصل، قيمة الإعلان الحالية هي
   * الخيار الوحيد. الفورم مش محجوب على الكتالوج: التعديل الأساسي
   * (سعر/وصف) شغال حتى لو نداء الكتالوج اتأخر.
   */
  const cat = catalog.data;
  const makeOptions = cat?.makes ?? (form ? [form.make] : []);
  const modelOptions = form ? (cat?.modelsByMake[form.make] ?? [form.model]) : [];
  const bodyOptions = cat?.bodies ?? (form ? [form.body] : []);
  const colorOptions = cat?.colors ?? (form ? [form.color] : []);
  const govOptions = cat?.governorates ?? (form ? [form.governorate] : []);
  const areaOptions = form ? (cat?.areasByGov[form.governorate] ?? [form.area]) : [];

  const daysListed =
    l && l.publishedAt
      ? Math.max(1, Math.round((nowMs() - new Date(l.publishedAt).getTime()) / DAY_MS))
      : null;

  const gap = l && l.marketAvg !== null ? ((l.price - l.marketAvg) / l.marketAvg) * 100 : null;

  const onSave = () => {
    if (!l || !form || hasError) return;
    const patch: Record<string, unknown> = {
      transmission: form.transmission,
      body: form.body,
      color: form.color,
      governorate: form.governorate,
      area: form.area,
      description: form.description,
    };
    // الحقول المقفولة مابتتبعتش أصلًا — أقل مساحة لخطأ 409
    if (!locked) {
      patch.make = form.make;
      patch.model = form.model;
      patch.year = toNumber(form.year);
      patch.price = toNumber(form.price);
      patch.km = toNumber(form.km);
    }
    update.mutate(
      { id: l.id, patch },
      {
        onSuccess: () => {
          toast({ tone: 'ok', title: 'التعديل اتحفظ' });
          listing.refetch();
        },
        onError: (e) => toast({ tone: 'crit', title: 'الحفظ مانفعش', body: errorMessage(e) }),
      },
    );
  };

  if (listing.isLoading) {
    return (
      <>
        <PageHeader title="تفاصيل العربية" motif="underline" />
        <Sheet>
          <Skeleton className="mb-4 h-24 w-full" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Skeleton className="h-[420px] w-full xl:col-span-2" />
            <Skeleton className="h-[420px] w-full" />
          </div>
        </Sheet>
      </>
    );
  }

  if (listing.isError || !l || !form) {
    return (
      <>
        <PageHeader title="تفاصيل العربية" motif="underline" />
        <Sheet>
          <Card padded={false}>
            <ErrorState
              message={listing.isError ? errorMessage(listing.error) : 'الإعلان مش موجود'}
              onRetry={() => listing.refetch()}
            />
            <div className="flex justify-center pb-8">
              <Button variant="outline" icon={<ArrowRight />} onClick={() => router.push('/inventory')}>
                ارجع للمخزون
              </Button>
            </div>
          </Card>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${l.title} ${l.year}`}
        subtitle={`${l.governorate} · ${l.area} · ${formatEGP(l.price)}`}
        motif="underline"
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight />}
            onClick={() => router.push('/inventory')}
            className="!text-white/75 hover:!bg-white/10 hover:!text-white"
          >
            كل العربيات
          </Button>
        }
      />

      <Sheet>
        {/* ───── حالة الإعلان ───── */}
        {l.status === 'draft' ? (
          <Banner
            tone="crit"
            icon={<EyeOff />}
            title="مخفية — محتاجة صورة"
            action={
              <Button
                variant="danger"
                size="sm"
                icon={<ImagePlus />}
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoOpen(true);
                }}
              >
                ارفع صورة
              </Button>
            }
            className="mb-4"
          >
            العربية دي لسه مسودة ومحدش شايفها — لا في السوق ولا في صفحة المعرض. أول صورة هي اللي
            بتنشرها.
          </Banner>
        ) : null}

        {/* ───── فخ ٢: قيود التعديل (L-7) ───── */}
        {locked ? (
          <Banner tone="warn" icon={<Lock />} title={`${lockReason} — بعض الحقول مقفولة`} className="mb-4">
            السعر والعداد والسنة والماركة والموديل مايتغيّروش دلوقتي، لأن فيه ناس بتزايد أو بتفاوض
            على نفس الأرقام دي. الوصف والصور والمحافظة لسه بتتعدّل عادي. الحقول هترجع تشتغل أول ما
            {lockedByAuction ? ' المزاد يقفل.' : ' الطلب يتقفل أو يتلغي.'}
          </Banner>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* ───── الفورم ───── */}
          <div className="xl:col-span-2">
            <Card>
              <SectionHeader
                title="بيانات العربية"
                hint="التعديل بيظهر في السوق على طول"
                className="mb-5"
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="الماركة"
                  hint={locked ? lockReason : undefined}
                >
                  <Select
                    value={form.make}
                    disabled={locked}
                    onChange={(e) =>
                      set({
                        make: e.target.value,
                        model: cat?.modelsByMake[e.target.value]?.[0] ?? '',
                      })
                    }
                  >
                    {makeOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="الموديل" hint={locked ? lockReason : undefined}>
                  <Select
                    value={form.model}
                    disabled={locked}
                    onChange={(e) => set({ model: e.target.value })}
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="سنة الموديل"
                  error={errors.year}
                  hint={locked ? lockReason : undefined}
                >
                  <Input
                    value={form.year}
                    disabled={locked}
                    invalid={Boolean(errors.year)}
                    inputMode="numeric"
                    onChange={(e) => set({ year: e.target.value })}
                  />
                </Field>

                <Field
                  label="السعر (ج.م)"
                  error={errors.price}
                  hint={locked ? lockReason : 'السعر المعروض للمشتري'}
                >
                  <Input
                    value={form.price}
                    disabled={locked}
                    invalid={Boolean(errors.price)}
                    inputMode="numeric"
                    onChange={(e) => set({ price: e.target.value })}
                  />
                </Field>

                <Field
                  label="العداد (كم)"
                  error={errors.km}
                  hint={
                    locked
                      ? lockReason
                      : `آخر قيمة مسجّلة ${withThousands(l.km)} كم — العداد بيزيد بس`
                  }
                >
                  <Input
                    value={form.km}
                    disabled={locked}
                    invalid={Boolean(errors.km)}
                    inputMode="numeric"
                    onChange={(e) => set({ km: e.target.value })}
                  />
                </Field>

                <Field label="ناقل الحركة">
                  <Select
                    value={form.transmission}
                    onChange={(e) => set({ transmission: e.target.value })}
                  >
                    {TRANSMISSIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="الفئة">
                  <Select value={form.body} onChange={(e) => set({ body: e.target.value })}>
                    {bodyOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="اللون">
                  <Select value={form.color} onChange={(e) => set({ color: e.target.value })}>
                    {colorOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="المحافظة">
                  <Select
                    value={form.governorate}
                    onChange={(e) =>
                      set({
                        governorate: e.target.value,
                        area: cat?.areasByGov[e.target.value]?.[0] ?? '',
                      })
                    }
                  >
                    {govOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="المنطقة">
                  <Select value={form.area} onChange={(e) => set({ area: e.target.value })}>
                    {areaOptions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="الوصف"
                  hint="اكتب حالة العربية والصيانات — الوصف الواضح بيقلّل الاستفسارات المكررة"
                  className="sm:col-span-2"
                >
                  <Textarea
                    rows={5}
                    value={form.description}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p className="text-caption text-content-sub">
                  {dirty ? 'فيه تعديلات لسه ماتحفظتش' : 'مفيش تعديلات جديدة'}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setForm({
                        make: l.make,
                        model: l.model,
                        year: String(l.year),
                        price: String(l.price),
                        km: String(l.km),
                        transmission: l.transmission,
                        body: l.body,
                        color: l.color,
                        governorate: l.governorate,
                        area: l.area,
                        description: l.description,
                      })
                    }
                    disabled={!dirty || update.isPending}
                  >
                    رجّع زي ما كان
                  </Button>
                  <Button
                    variant="primary"
                    icon={<Save />}
                    onClick={onSave}
                    disabled={!dirty || hasError}
                    loading={update.isPending}
                  >
                    احفظ التعديلات
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* ───── الصورة والإحصائيات والأكشنات ───── */}
          <div className="space-y-4">
            <Card padded={false} className="overflow-hidden">
              {l.imageUrl ? (
                // صور محلية في public/cars — img عادي مش next/image
                <img src={l.imageUrl} alt="" className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-44 w-full flex-col items-center justify-center gap-2 bg-muted-soft text-content-faint">
                  <Car className="h-8 w-8" />
                  <span className="text-caption">مفيش صور — الإعلان مخفي</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 p-4">
                <Badge tone={l.status === 'draft' ? 'crit' : l.status === 'active' ? 'ok' : 'neutral'}>
                  {l.status === 'draft' ? 'مخفية' : l.status === 'active' ? 'نشطة' : 'مش معروضة'}
                </Badge>
                <Badge tone="neutral">{withThousands(l.photosCount)} صورة</Badge>
                {l.kmVerified ? (
                  <Badge tone="ok" icon={<ShieldCheck />}>
                    ممشى موثّق
                  </Badge>
                ) : null}
                {l.inspected ? (
                  <Badge tone="ok" icon={<ShieldCheck />}>
                    مفحوصة
                  </Badge>
                ) : null}
                {auction && auction.status === 'live' ? (
                  /* الشارة للمزاد الشغال بس — المنتهي مش بيقيّد حاجة (L-7) */
                  <Badge tone="accent" icon={<Gavel />}>
                    في مزاد
                  </Badge>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ImagePlus />}
                  className="ms-auto"
                  onClick={() => {
                    setPhotoFile(null);
                    setPhotoOpen(true);
                  }}
                >
                  ضيف صورة
                </Button>
              </div>
            </Card>

            <Card>
              <SectionHeader title="أرقام الإعلان" className="mb-4" />
              <dl className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-sub text-content-sub">
                    <Eye className="h-4 w-4" /> مشاهدات
                  </dt>
                  <dd className="tnum text-title text-content">{withThousands(l.viewsCount)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-sub text-content-sub">
                    <MessagesSquare className="h-4 w-4" /> استفسارات
                  </dt>
                  <dd className="tnum text-title text-content">{withThousands(leadsCount)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-sub text-content-sub">
                    <Timer className="h-4 w-4" /> أيام معروضة
                  </dt>
                  <dd className="tnum text-title text-content">
                    {daysListed === null ? 'لسه ماتنشرتش' : `${withThousands(daysListed)} يوم`}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                  <dt className="text-sub text-content-sub">السعر مقابل السوق</dt>
                  <dd>
                    {gap === null ? (
                      <Badge tone="neutral" icon={<EyeOff />}>
                        مش متسعّرة
                      </Badge>
                    ) : (
                      <Badge tone={gap > 8 ? 'warn' : gap < -8 ? 'ok' : 'neutral'}>
                        {formatPct(gap, 0)} عن {formatEGP(l.marketAvg!)}
                      </Badge>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sub text-content-sub">العداد</dt>
                  <dd className="tnum text-sub font-bold text-content">{formatKm(l.km)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sub text-content-sub">بينتهي في</dt>
                  <dd className="text-sub font-bold text-content">
                    {l.expiresAt ? formatDateAr(l.expiresAt) : '—'}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <SectionHeader title="أكشنات" className="mb-4" />
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  icon={<RefreshCw />}
                  loading={renew.isPending}
                  onClick={() =>
                    renew.mutate(
                      { id: l.id },
                      {
                        onSuccess: () => {
                          toast({
                            tone: 'ok',
                            title: 'الإعلان اتجدّد',
                            body: 'هيفضل معروض ٣٠ يوم كمان من النهاردة.',
                          });
                          listing.refetch();
                        },
                        onError: (e) =>
                          toast({ tone: 'crit', title: 'التجديد مانفعش', body: errorMessage(e) }),
                      },
                    )
                  }
                >
                  جدّد ٣٠ يوم
                </Button>
                <Button
                  variant="ink"
                  icon={<CheckCircle2 />}
                  disabled={l.status === 'sold'}
                  onClick={() => setSoldOpen(true)}
                >
                  {l.status === 'sold' ? 'متعلّمة متباعة' : 'علّمها متباعة'}
                </Button>
                <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
                  احذف الإعلان
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Sheet>

      {/* ───── رفع صورة ───── */}
      <Dialog
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        title={l.status === 'draft' ? 'ارفع أول صورة' : 'ضيف صورة'}
        subtitle={`${l.title} ${l.year}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPhotoOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              disabled={!photoFile}
              loading={uploadPhoto.isPending}
              onClick={() =>
                uploadPhoto.mutate(
                  { id: l.id, file: photoFile ?? undefined },
                  {
                    onSuccess: () => {
                      toast({
                        tone: 'ok',
                        title: l.status === 'draft' ? 'الإعلان بقى نشط' : 'الصورة اترفعت',
                      });
                      setPhotoOpen(false);
                      listing.refetch();
                    },
                    onError: (e) =>
                      toast({ tone: 'crit', title: 'الرفع مانفعش', body: errorMessage(e) }),
                  },
                )
              }
            >
              {l.status === 'draft' ? 'ارفع وفعّل الإعلان' : 'ارفع'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {l.status === 'draft' ? (
            <p className="text-sub text-content-sub">
              العربية مسودة دلوقتي. أول صورة بتنشرها فورًا وتخليها معروضة ٣٠ يوم.
            </p>
          ) : null}
          <FileDrop
            label="اختار صورة العربية"
            hint="JPG أو PNG"
            accept="image/*"
            fileName={photoFile?.name ?? null}
            onPick={(f) => {
              const error = validateFile(f, { acceptedTypes: ACCEPTED_IMAGE_TYPES });
              if (error) {
                toast({ tone: 'crit', title: 'الصورة مرفوضة', body: error });
                return;
              }
              setPhotoFile(f);
            }}
            icon={<ImagePlus />}
          />
        </div>
      </Dialog>

      {/* ───── تعليم متباع ───── */}
      <ConfirmDialog
        open={soldOpen}
        onClose={() => setSoldOpen(false)}
        title="تعليم العربية متباعة"
        impact={`${l.title} ${l.year} هتتشال من السوق وهتتعلّم متباعة، والاستفسارات الجديدة هتقف.`}
        confirmLabel="علّمها متباعة"
        tone="accent"
        requireReason={false}
        loading={markSold.isPending}
        onConfirm={() =>
          markSold.mutate(
            { id: l.id },
            {
              onSuccess: () => {
                toast({ tone: 'ok', title: 'اتعلّمت متباعة' });
                setSoldOpen(false);
                listing.refetch();
              },
              onError: (e) => toast({ tone: 'crit', title: 'مانفعش', body: errorMessage(e) }),
            },
          )
        }
      />

      {/* ───── حذف ───── */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="حذف الإعلان"
        impact={`${l.title} ${l.year} هتختفي من السوق ومن صفحة المعرض، والاستفسارات اللي عليها مش هتوصلك تاني.`}
        confirmLabel="احذف"
        tone="crit"
        requireReason={false}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: l.id },
            {
              onSuccess: () => {
                toast({ tone: 'ok', title: 'الإعلان اتحذف' });
                setDeleteOpen(false);
                router.push('/inventory');
              },
              onError: (e) => toast({ tone: 'crit', title: 'مانفعش', body: errorMessage(e) }),
            },
          )
        }
      />
    </>
  );
}
