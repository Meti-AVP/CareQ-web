'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  EyeOff,
  ImagePlus,
  Info,
  Plus,
  Save,
  X,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
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
  formatEGP,
  useToast,
  withThousands,
  validateFile,
  ACCEPTED_IMAGE_TYPES,
} from '@carq/ui';
import {
  errorMessage,
  useCatalog,
  useCreateListing,
  useUploadListingPhoto,
  type Catalog,
} from '@carq/api-client';
import {
  KM_MAX,
  PRICE_MAX,
  PRICE_MIN,
  TRANSMISSIONS,
  YEAR_MAX,
  YEAR_MIN,
  kmError,
  priceError,
  toNumber,
  yearError,
} from '@/lib/catalog';

/**
 * ════════════════════════════════════════════════════════════════
 * `/inventory/new` — ضيف عربية (EXHIBITION_PORTAL_SPEC §4.2)
 *
 * **الرسالة الإلزامية بتتقال قبل الحفظ مش بعده:** الإعلان بيتولد
 * `draft` وأول صورة هي اللي بتفعّله (D-2). البائع اللي بيسيب الشاشة
 * فاكر إنه نشر بيفضل مستني استفسارات عمرها ماهتيجي — وده أكبر سبب
 * لعدّاد الـdraft العالي في الداشبورد.
 *
 * وحدود `L-3` بتتفحص هنا قبل الإرسال: السعر ١٠٬٠٠٠–١٠٠٬٠٠٠٬٠٠٠ ·
 * السنة ١٩٥٠–السنة الحالية+١ · العداد ٠–٢٬٠٠٠٬٠٠٠.
 * ════════════════════════════════════════════════════════════════
 */

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

/** القيم الافتراضية من الكتالوج — أول ماركة وأول محافظة متاحين */
function initialForm(catalog: Catalog): FormState {
  const firstMake = catalog.makes[0] ?? '';
  const firstGov = catalog.governorates[0] ?? '';
  return {
    make: firstMake,
    model: catalog.modelsByMake[firstMake]?.[0] ?? '',
    year: '',
    price: '',
    km: '',
    transmission: TRANSMISSIONS[0]!,
    body: catalog.bodies[0] ?? '',
    color: catalog.colors[0] ?? '',
    governorate: firstGov,
    area: catalog.areasByGov[firstGov]?.[0] ?? '',
    description: '',
  };
}

export default function NewListingPage() {
  const catalog = useCatalog();

  // الفورم مايتبنيش قبل الكتالوج — القوايم دي هي القيم الافتراضية بتاعته
  if (!catalog.data) {
    return (
      <>
        <PageHeader
          title="ضيف عربية"
          subtitle="دقيقتين وتبقى العربية معروضة — المهم الصورة"
          motif="swoosh"
        />
        <Sheet>
          <div className="mx-auto max-w-3xl">
            {catalog.isError ? (
              /* فشل الكتالوج بيتقال — مش سكيلتون للأبد */
              <Card>
                <ErrorState
                  message={errorMessage(catalog.error)}
                  onRetry={() => catalog.refetch()}
                />
              </Card>
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-96" />
              </div>
            )}
          </div>
        </Sheet>
      </>
    );
  }

  return <NewListingForm catalog={catalog.data} />;
}

function NewListingForm({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const toast = useToast();

  const create = useCreateListing();
  const uploadPhoto = useUploadListingPhoto();

  const [form, setForm] = useState<FormState>(() => initialForm(catalog));
  const [touched, setTouched] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const pickPhoto = (file: File, opts?: { replaceFirst?: boolean }) => {
    const error = validateFile(file, { acceptedTypes: ACCEPTED_IMAGE_TYPES });
    if (error) {
      toast({ tone: 'crit', title: 'الصورة مرفوضة', body: error });
      return;
    }
    setPhotos((p) => {
      if (opts?.replaceFirst) return [file, ...p.slice(1)];
      if (p.some((x) => x.name === file.name && x.size === file.size)) return p;
      return [...p, file];
    });
  };

  const priceNum = toNumber(form.price);
  const yearNum = toNumber(form.year);
  const kmNum = toNumber(form.km);

  const errors = useMemo(
    () => ({
      price: priceError(priceNum),
      year: yearError(yearNum),
      km: kmError(kmNum),
    }),
    [priceNum, yearNum, kmNum],
  );
  const hasError = Object.values(errors).some(Boolean);

  const onSubmit = () => {
    setTouched(true);
    if (hasError) {
      toast({
        tone: 'crit',
        title: 'فيه حقول محتاجة تظبيط',
        body: 'صلّح الحقول المعلّمة بالأحمر وحاول تاني.',
      });
      return;
    }
    create.mutate(
      {
        title: `${form.make} ${form.model}`,
        make: form.make,
        model: form.model,
        year: yearNum,
        price: priceNum,
        km: kmNum,
        transmission: form.transmission,
        body: form.body,
        color: form.color,
        governorate: form.governorate,
        area: form.area,
        description: form.description,
      },
      {
        onSuccess: (listing) => {
          setCreatedId(listing.id);
          toast({
            tone: 'ok',
            title: 'الإعلان اتحفظ كمسودة',
            body: 'فاضل أول صورة عشان يظهر للناس.',
          });
        },
        onError: (e) => toast({ tone: 'crit', title: 'الحفظ مانفعش', body: errorMessage(e) }),
      },
    );
  };

  /** بيرفع كل الصور المختارة بالتوالي — الأولى هي اللي بتفعّل الإعلان (D-2) */
  const onUploadPhotos = async () => {
    if (!createdId || photos.length === 0) return;
    let anyActivated = false;
    for (const file of photos) {
      try {
        const res = await uploadPhoto.mutateAsync({ id: createdId, file });
        if (res.activated) anyActivated = true;
      } catch (e) {
        toast({ tone: 'crit', title: 'رفع صورة فشل', body: errorMessage(e) });
      }
    }
    if (anyActivated) {
      setActivated(true);
      toast({
        tone: 'ok',
        title: 'الإعلان بقى نشط',
        body: 'العربية ظهرت في السوق وفي صفحة المعرض.',
      });
    }
  };

  /* ───────── بعد الحفظ: الإعلان مسودة لحد ما الصورة ترفع ───────── */
  if (createdId) {
    return (
      <>
        <PageHeader
          title="الإعلان اتحفظ"
          subtitle={`${form.make} ${form.model} ${form.year || ''}`}
          motif="swoosh"
        />
        <Sheet>
          <Card className="mx-auto max-w-2xl animate-rise">
            <div className="flex items-start gap-3">
              <span
                className={
                  activated
                    ? 'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok'
                    : 'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-crit-soft text-crit'
                }
              >
                {activated ? <CheckCircle2 className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-h2 text-content">
                  {activated ? 'الإعلان نشط ومعروض' : 'الإعلان مسودة — لسه محدش شايفه'}
                </p>
                <p className="mt-1 text-sub text-content-sub">
                  {activated
                    ? 'العربية دلوقتي في السوق وفي صفحة المعرض، ومعروضة ٣٠ يوم.'
                    : 'الإعلان اتحفظ بكل بياناته، بس مش بيظهر في السوق ولا في صفحة المعرض قبل أول صورة. ارفع صورة واحدة وهيتنشر على طول.'}
                </p>
              </div>
            </div>

            {!activated ? (
              <div className="mt-5 space-y-4">
                <FileDrop
                  label="اختار أول صورة للعربية"
                  hint="الصورة الأولى هي اللي بتظهر في نتايج البحث"
                  accept="image/*"
                  fileName={photos[0]?.name ?? null}
                  onPick={(f) => pickPhoto(f, { replaceFirst: true })}
                  icon={<ImagePlus />}
                />
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<ImagePlus />}
                  disabled={photos.length === 0}
                  loading={uploadPhoto.isPending}
                  onClick={onUploadPhotos}
                >
                  {photos.length > 1
                    ? `ارفع ${photos.length} صور وفعّل الإعلان`
                    : 'ارفع الصورة وفعّل الإعلان'}
                </Button>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
              <Button variant="ink" icon={<ArrowRight />} onClick={() => router.push('/inventory')}>
                روح للمخزون
              </Button>
              <Button
                variant="outline"
                icon={<Plus />}
                onClick={() => {
                  setForm(initialForm(catalog));
                  setPhotos([]);
                  setCreatedId(null);
                  setActivated(false);
                  setTouched(false);
                }}
              >
                ضيف عربية تانية
              </Button>
            </div>
          </Card>
        </Sheet>
      </>
    );
  }

  /* ───────── الفورم ───────── */
  return (
    <>
      <PageHeader
        title="ضيف عربية"
        subtitle="دقيقتين وتبقى العربية معروضة — المهم الصورة"
        motif="swoosh"
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
        {/* ───── الرسالة الإلزامية: قبل الحفظ مش بعده (D-2) ───── */}
        <Banner
          tone="warn"
          icon={<EyeOff />}
          title="الإعلان بيتحفظ مسودة — وأول صورة هي اللي بتنشره"
          className="mx-auto mb-6 max-w-3xl"
        >
          لحد ما ترفع أول صورة، العربية مش بتظهر في السوق ولا في صفحة المعرض ومحدش بيقدر يستفسر
          عليها. تقدر تحفظ دلوقتي وترفع الصور بعدين — بس اعرف إنها هتفضل مخفية لغاية وقتها.
        </Banner>

        <div className="mx-auto max-w-3xl space-y-4">
          <Card>
            <SectionHeader title="العربية" hint="الماركة والموديل بيتحلّوا مقابل كتالوج CarQ" className="mb-5" />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="الماركة" required>
                <Select
                  value={form.make}
                  onChange={(e) =>
                    set({
                      make: e.target.value,
                      model: catalog.modelsByMake[e.target.value]?.[0] ?? '',
                    })
                  }
                >
                  {catalog.makes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="الموديل" required>
                <Select value={form.model} onChange={(e) => set({ model: e.target.value })}>
                  {(catalog.modelsByMake[form.make] ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="سنة الموديل"
                required
                hint={`من ${YEAR_MIN} لحد ${YEAR_MAX}`}
                error={touched ? errors.year : undefined}
              >
                <Input
                  value={form.year}
                  inputMode="numeric"
                  placeholder="2021"
                  invalid={touched && Boolean(errors.year)}
                  onChange={(e) => set({ year: e.target.value })}
                />
              </Field>

              <Field
                label="السعر (ج.م)"
                required
                hint={`من ${withThousands(PRICE_MIN)} لحد ${withThousands(PRICE_MAX)}`}
                error={touched ? errors.price : undefined}
              >
                <Input
                  value={form.price}
                  inputMode="numeric"
                  placeholder="850000"
                  invalid={touched && Boolean(errors.price)}
                  onChange={(e) => set({ price: e.target.value })}
                />
              </Field>

              <Field
                label="العداد (كم)"
                required
                hint={`من 0 لحد ${withThousands(KM_MAX)} — الرقم ده مابينقصش بعد كده`}
                error={touched ? errors.km : undefined}
              >
                <Input
                  value={form.km}
                  inputMode="numeric"
                  placeholder="60000"
                  invalid={touched && Boolean(errors.km)}
                  onChange={(e) => set({ km: e.target.value })}
                />
              </Field>

              <Field label="ناقل الحركة" required>
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

              <Field label="الفئة" required>
                <Select value={form.body} onChange={(e) => set({ body: e.target.value })}>
                  {catalog.bodies.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="اللون" required>
                <Select value={form.color} onChange={(e) => set({ color: e.target.value })}>
                  {catalog.colors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="المحافظة" required>
                <Select
                  value={form.governorate}
                  onChange={(e) =>
                    set({
                      governorate: e.target.value,
                      area: catalog.areasByGov[e.target.value]?.[0] ?? '',
                    })
                  }
                >
                  {catalog.governorates.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="المنطقة" required>
                <Select value={form.area} onChange={(e) => set({ area: e.target.value })}>
                  {(catalog.areasByGov[form.governorate] ?? []).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="الوصف"
                hint="الصيانات والحالة وأي حاجة المشتري هيسأل عنها — الوصف الواضح بيقلّل المكالمات الفاضية"
                className="sm:col-span-2"
              >
                <Textarea
                  rows={5}
                  value={form.description}
                  placeholder="فابريكا بالكامل، الصيانات بالتوكيل، كاوتش جديد…"
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="صور العربية"
              hint="الرفع الفعلي بيحصل بعد الحفظ — الإعلان لازم يتولد الأول"
              className="mb-5"
            />
            <FileDrop
              label="اسحب الصور هنا أو اختار من الجهاز"
              hint="JPG أو PNG — رتّب الصور بحيث تكون الواجهة أول واحدة"
              accept="image/*"
              fileName={null}
              onPick={(f) => pickPhoto(f)}
              icon={<ImagePlus />}
            />

            {photos.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {photos.map((file, i) => (
                  <li key={`${file.name}-${file.size}`}>
                    <span className="inline-flex items-center gap-2 rounded-full bg-surface-alt px-3 py-1.5 text-caption text-content">
                      {i === 0 ? <Badge tone="accent">الواجهة</Badge> : null}
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <button
                        type="button"
                        aria-label={`شيل ${file.name}`}
                        onClick={() => setPhotos((p) => p.filter((x) => x !== file))}
                        className="text-content-faint transition-colors hover:text-crit"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-4 flex items-start gap-2 text-caption text-content-sub">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              الصور متسجّلة في المتصفح دلوقتي بس. أول ما تحفظ الإعلان، هنرفع الصورة الأولى وهي
              اللي بتفعّله.
            </p>
          </Card>

          <Card className="border-accent/25 bg-accent-soft/50">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-title text-content">
                  {priceError(priceNum) ? 'لسه محتاج السعر' : formatEGP(priceNum)}
                </p>
                <p className="mt-1 text-sub text-content-sub">
                  {form.make} {form.model} {form.year ? `موديل ${form.year}` : ''} ·{' '}
                  {form.governorate}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => router.push('/inventory')}>
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  icon={<Save />}
                  loading={create.isPending}
                  onClick={onSubmit}
                >
                  احفظ كمسودة
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Sheet>
    </>
  );
}
