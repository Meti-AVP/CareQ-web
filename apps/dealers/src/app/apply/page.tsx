'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  FileCheck2,
  FileSignature,
  IdCard,
  ImageIcon,
  Lock,
  Receipt,
  Send,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Field,
  FileDrop,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  Switch,
  Textarea,
  useToast,
  withThousands,
} from '@carq/ui';
import { useCatalog } from '@carq/api-client';
import { isEgyptianPhone } from '@/lib/catalog';

/**
 * ════════════════════════════════════════════════════════════════
 * `/apply` — طلب الترقية لمعرض (EXHIBITION_PORTAL_SPEC §2.2)
 *
 * مفيش «إنشاء حساب معرض». المعرض **حساب فرد اترقّى** عشان يفضل ليه
 * نفس الهوية والتليفون والإعلانات (I-1, I-2).
 *
 * وخطوتين مختلفتين عن قصد:
 *   الموافقة  → بتخليك معرض (الدور)
 *   التعاقد   → هو اللي بيفتح المزايدة (العَلَم)
 * معرض عقده خلص بيفضل معرض — بس مابيزايدش.
 * ════════════════════════════════════════════════════════════════
 */

const MAX_BYTES = 10 * 1024 * 1024;
const VENUE_SLOTS = 6;
const VENUE_MIN = 3;

type DocKind = 'commercial_register' | 'tax_card' | 'owner_id_front' | 'owner_id_back' | 'logo';

const STEPS = [
  { key: 'data', label: 'بيانات المعرض' },
  { key: 'docs', label: 'الأوراق' },
  { key: 'review', label: 'المراجعة' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function ApplyPage() {
  const toast = useToast();
  const [step, setStep] = useState<StepKey>('data');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  /* بيانات */
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [commercialRegister, setCommercialRegister] = useState('');
  const [taxId, setTaxId] = useState('');
  const [inspectionService, setInspectionService] = useState(false);
  const [financingNote, setFinancingNote] = useState('');

  /* أوراق */
  const [docs, setDocs] = useState<Partial<Record<DocKind, string>>>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<string, string>>>({});
  const [venue, setVenue] = useState<Array<string | null>>(Array(VENUE_SLOTS).fill(null));

  /** المحافظات والمناطق من الكتالوج — القايمة فاضية لثانية لحد ما يوصل */
  const catalog = useCatalog();
  const governorates = catalog.data?.governorates ?? [];
  const areas = useMemo(
    () => catalog.data?.areasByGov[governorate] ?? [],
    [catalog.data, governorate],
  );
  const venueCount = venue.filter(Boolean).length;

  const errors = {
    name:
      name.trim().length < 3 || name.trim().length > 160
        ? 'اسم المعرض لازم يكون من ٣ لـ ١٦٠ حرف'
        : undefined,
    ownerName: ownerName.trim().length < 3 ? 'اكتب اسم المالك زي ما هو في البطاقة' : undefined,
    phone: isEgyptianPhone(phone) ? undefined : 'رقم مصري: موبايل (010/011/012/015) أو أرضي',
    governorate: governorate ? undefined : 'اختار المحافظة',
    area: area.trim() ? undefined : 'اكتب أو اختار المنطقة',
    address: address.trim().length < 10 ? 'اكتب العنوان بالتفصيل — الشارع والعلامة المميزة' : undefined,
    commercialRegister: commercialRegister.trim() ? undefined : 'رقم السجل التجاري إجباري',
    taxId: taxId.trim() ? undefined : 'الرقم الضريبي إجباري',
  };

  const dataValid = Object.values(errors).every((e) => e === undefined);
  const docsValid =
    Boolean(docs.commercial_register) &&
    Boolean(docs.tax_card) &&
    Boolean(docs.owner_id_front) &&
    Boolean(docs.owner_id_back) &&
    venueCount >= VENUE_MIN;

  const pickDoc = (kind: DocKind, file: File) => {
    if (file.size > MAX_BYTES) {
      setDocErrors((p) => ({ ...p, [kind]: 'الملف أكبر من ١٠ ميجا — صغّره وارفعه تاني' }));
      return;
    }
    setDocErrors((p) => ({ ...p, [kind]: undefined }));
    setDocs((p) => ({ ...p, [kind]: file.name }));
  };

  const pickVenue = (i: number, file: File) => {
    if (file.size > MAX_BYTES) {
      setDocErrors((p) => ({ ...p, [`venue-${i}`]: 'الملف أكبر من ١٠ ميجا' }));
      return;
    }
    setDocErrors((p) => ({ ...p, [`venue-${i}`]: undefined }));
    setVenue((prev) => prev.map((v, k) => (k === i ? file.name : v)));
  };

  const goNext = () => {
    setTouched(true);
    if (step === 'data' && dataValid) {
      setTouched(false);
      setStep('docs');
    } else if (step === 'docs' && docsValid) {
      setTouched(false);
      setStep('review');
    }
  };

  const goBack = () => {
    setTouched(false);
    setStep(step === 'review' ? 'docs' : 'data');
  };

  const submit = () => {
    setSending(true);
    // POST /v1/exhibitions/applications + رفع كل ورقة بـmultipart — لسه مطلوبين في الباك (§8.2)
    window.setTimeout(() => {
      setSending(false);
      setSubmitted(true);
      toast({
        title: 'طلبك وصلنا',
        body: 'المراجعة بتاخد ٢ لـ ٣ أيام عمل — وهتوصلك رسالة على تليفون المعرض.',
        tone: 'ok',
      });
    }, 900);
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  /* ───── شاشة ما بعد الإرسال ───── */
  if (submitted) {
    return (
      <main className="min-h-screen bg-canvas">
        <PageHeader title="طلبك وصلنا" subtitle="المراجعة بتاخد ٢ لـ ٣ أيام عمل" motif="circle" />
        <Sheet>
          <div className="mx-auto max-w-2xl">
            <Card className="animate-rise text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <p className="text-h2 text-content">استلمنا طلب معرض {name.trim()}</p>
              <p className="mt-2 text-body text-content-sub">
                فريق CarQ هيراجع الأوراق ويرد عليك على {phone}. لو في حاجة ناقصة هنطلبها منك
                بالتحديد — مش هنرفض الطلب من غير سبب.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href="/apply/status">
                  <Button iconEnd={<ArrowLeft />}>تابع حالة الطلب</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline">رجوع للدخول</Button>
                </Link>
              </div>
            </Card>
          </div>
        </Sheet>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <PageHeader
        title="قدّم كمعرض"
        subtitle="حسابك الحالي بيترقّى لمعرض — بنفس الرقم وبنفس إعلاناتك"
        motif="swoosh"
        actions={
          <Link href="/apply/status">
            <Button variant="white" size="sm" iconEnd={<ArrowLeft />}>
              حالة طلبي
            </Button>
          </Link>
        }
      >
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (i < stepIndex) setStep(s.key);
                  }}
                  disabled={i > stepIndex}
                  className={[
                    'flex items-center gap-2 rounded-full px-3.5 py-2 text-sub font-bold transition-colors',
                    active
                      ? 'bg-white text-ink'
                      : done
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-white/40',
                  ].join(' ')}
                >
                  <span className="tnum inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/15 text-[11px]">
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 ? <span className="h-px w-4 bg-white/20" /> : null}
              </li>
            );
          })}
        </ol>
      </PageHeader>

      <Sheet>
        <div className="mx-auto max-w-4xl space-y-4">
          {/* ───── الفرق بين الموافقة والتعاقد — أهم سوء فهم في الفلو ───── */}
          <Card className="animate-rise border-accent/25 bg-accent-soft/40">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-accent">
                <FileSignature className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-title text-content">قرارين مختلفين — مش قرار واحد</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-surface px-4 py-3">
                    <p className="flex items-center gap-2 text-sub font-bold text-content">
                      <Store className="h-4 w-4 text-content-sub" />
                      الموافقة على الطلب
                    </p>
                    <p className="mt-1 text-caption text-content-sub">
                      بتخلّي حسابك معرض: ملف عام للمشترين، شارة توثيق، ومخزون ورفع بالجملة.
                    </p>
                  </div>
                  <div className="rounded-md bg-surface px-4 py-3">
                    <p className="flex items-center gap-2 text-sub font-bold text-content">
                      <FileSignature className="h-4 w-4 text-content-sub" />
                      التعاقد
                    </p>
                    <p className="mt-1 text-caption text-content-sub">
                      قرار تاني مستقل، وهو اللي بيفتح المزايدة في مزادات CarQ. الموافقة لوحدها
                      مابتفتحش المزايدة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ═════ الخطوة ١: بيانات ═════ */}
          {step === 'data' ? (
            <>
              <Card>
                <SectionHeader title="بيانات المعرض" hint="اللي بيظهر للمشترين في التطبيق" />
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="اسم المعرض"
                      required
                      error={touched ? errors.name : undefined}
                      hint="من ٣ لـ ١٦٠ حرف"
                    >
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        invalid={touched && Boolean(errors.name)}
                        placeholder="زي ما هو على اللافتة"
                      />
                    </Field>
                    <Field label="اسم المالك" required error={touched ? errors.ownerName : undefined}>
                      <Input
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        invalid={touched && Boolean(errors.ownerName)}
                        placeholder="بالاسم الرباعي زي البطاقة"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="تليفون المعرض"
                      required
                      error={touched ? errors.phone : undefined}
                      hint="موبايل مصري أو أرضي — ده الرقم اللي بنكلّمك عليه"
                    >
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="tel"
                        className="tnum"
                        invalid={touched && Boolean(errors.phone)}
                        placeholder="01x xxxx xxxx"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="المحافظة" required error={touched ? errors.governorate : undefined}>
                        <Select
                          value={governorate}
                          onChange={(e) => {
                            setGovernorate(e.target.value);
                            setArea('');
                          }}
                          invalid={touched && Boolean(errors.governorate)}
                        >
                          <option value="">اختار</option>
                          {governorates.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="المنطقة" required error={touched ? errors.area : undefined}>
                        {areas.length ? (
                          <Select
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            invalid={touched && Boolean(errors.area)}
                          >
                            <option value="">اختار</option>
                            {areas.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            invalid={touched && Boolean(errors.area)}
                            placeholder="اسم المنطقة"
                          />
                        )}
                      </Field>
                    </div>
                  </div>

                  <Field
                    label="العنوان بالتفصيل"
                    required
                    error={touched ? errors.address : undefined}
                    hint="الشارع والرقم وعلامة مميزة — العنوان بيتشاف من المشتري قبل المعاينة"
                  >
                    <Textarea
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      invalid={touched && Boolean(errors.address)}
                      placeholder="مثال: ٢٢ شارع النصر — أمام محطة المترو"
                    />
                  </Field>
                </div>
              </Card>

              <Card>
                <SectionHeader
                  title="الأرقام الرسمية"
                  hint="بتتطابق مع الأوراق في الخطوة الجاية — أي اختلاف بيوقف الطلب"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="رقم السجل التجاري"
                    required
                    error={touched ? errors.commercialRegister : undefined}
                  >
                    <Input
                      value={commercialRegister}
                      onChange={(e) => setCommercialRegister(e.target.value)}
                      className="tnum"
                      invalid={touched && Boolean(errors.commercialRegister)}
                    />
                  </Field>
                  <Field label="الرقم الضريبي" required error={touched ? errors.taxId : undefined}>
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="tnum"
                      invalid={touched && Boolean(errors.taxId)}
                    />
                  </Field>
                </div>
              </Card>

              <Card>
                <SectionHeader title="خدمات المعرض" hint="اختيارية — بس بتفرق مع المشتري" />
                <div className="space-y-5">
                  <Switch
                    checked={inspectionService}
                    onChange={setInspectionService}
                    label="بنقدّم فحص فني"
                    hint="بتظهر كشارة على صفحة المعرض وعلى إعلاناتك"
                    tone="ok"
                  />
                  <Field
                    label="ملاحظة التمويل"
                    hint="المقدم والمدة والشريك — من غير وعود مش مضمونة"
                  >
                    <Textarea
                      rows={3}
                      value={financingNote}
                      onChange={(e) => setFinancingNote(e.target.value)}
                      placeholder="مثال: تقسيط لحد ٦٠ شهر بمقدم ٣٠٪ من خلال شركاء التمويل"
                    />
                  </Field>
                </div>
              </Card>
            </>
          ) : null}

          {/* ═════ الخطوة ٢: أوراق ═════ */}
          {step === 'docs' ? (
            <>
              <Banner
                tone="crit"
                icon={<Lock />}
                title="الأوراق دي بيانات شخصية وتجارية حساسة"
                className="animate-rise"
              >
                السجل التجاري والبطاقة الضريبية وبطاقة المالك بتتخزن تحت بادئة private، وبتتعرض
                لفريق المراجعة بروابط موقّعة ٥ دقايق بس، وكل فتحة بتتسجّل. مفيش رابط عام، ومفيش
                تنزيل.
              </Banner>

              <Card>
                <SectionHeader
                  title="الأوراق الرسمية"
                  hint="صورة واضحة وسارية · jpg أو png أو PDF · حد أقصى ١٠ ميجا لكل ملف"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(
                    [
                      { kind: 'commercial_register', label: 'صورة السجل التجاري', icon: <Receipt /> },
                      { kind: 'tax_card', label: 'صورة البطاقة الضريبية', icon: <FileCheck2 /> },
                      { kind: 'owner_id_front', label: 'بطاقة المالك — الوش', icon: <IdCard /> },
                      { kind: 'owner_id_back', label: 'بطاقة المالك — الضهر', icon: <IdCard /> },
                    ] as Array<{ kind: DocKind; label: string; icon: ReactNode }>
                  ).map((d) => (
                    <div key={d.kind}>
                      <FileDrop
                        label={d.label}
                        hint="اضغط للاختيار — بيتخزن مشفّر تحت private"
                        icon={d.icon}
                        fileName={docs[d.kind] ?? null}
                        invalid={Boolean(docErrors[d.kind]) || (touched && !docs[d.kind])}
                        onPick={(f) => pickDoc(d.kind, f)}
                      />
                      {docErrors[d.kind] ? (
                        <p className="mt-1.5 text-caption font-bold text-crit">{docErrors[d.kind]}</p>
                      ) : touched && !docs[d.kind] ? (
                        <p className="mt-1.5 text-caption font-bold text-crit">الورقة دي إجبارية</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionHeader
                  title="صور المعرض"
                  hint={`من ٣ لـ ٦ صور — دي بتظهر للمشترين. رفعت ${withThousands(venueCount)}.`}
                  action={
                    <Badge tone={venueCount >= VENUE_MIN ? 'ok' : 'warn'} icon={<Camera />}>
                      {withThousands(venueCount)} من {VENUE_SLOTS}
                    </Badge>
                  }
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {venue.map((v, i) => (
                    <div key={i}>
                      <FileDrop
                        label={`صورة ${i + 1}`}
                        hint={i < VENUE_MIN ? 'مطلوبة' : 'اختيارية'}
                        accept="image/*"
                        icon={<Camera />}
                        fileName={v}
                        invalid={touched && i < VENUE_MIN && !v}
                        onPick={(f) => pickVenue(i, f)}
                      />
                      {docErrors[`venue-${i}`] ? (
                        <p className="mt-1.5 text-caption font-bold text-crit">
                          {docErrors[`venue-${i}`]}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {touched && venueCount < VENUE_MIN ? (
                  <p className="mt-3 flex items-center gap-2 text-caption font-bold text-crit">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    محتاجين ٣ صور للمعرض على الأقل
                  </p>
                ) : null}
              </Card>

              <Card>
                <SectionHeader title="لوجو المعرض" hint="اختياري — لو مفيش، بنستخدم أول حرفين من الاسم" />
                <div className="sm:max-w-xs">
                  <FileDrop
                    label="لوجو المعرض"
                    hint="مربع ويفضل خلفية بيضا"
                    accept="image/*"
                    icon={<ImageIcon />}
                    fileName={docs.logo ?? null}
                    invalid={Boolean(docErrors.logo)}
                    onPick={(f) => pickDoc('logo', f)}
                  />
                  {docErrors.logo ? (
                    <p className="mt-1.5 text-caption font-bold text-crit">{docErrors.logo}</p>
                  ) : null}
                </div>
              </Card>
            </>
          ) : null}

          {/* ═════ الخطوة ٣: مراجعة ═════ */}
          {step === 'review' ? (
            <>
              <Card>
                <SectionHeader title="راجع اللي هيتبعت" hint="التعديل لسه ممكن — ارجع لأي خطوة" />
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    { k: 'اسم المعرض', v: name.trim() },
                    { k: 'اسم المالك', v: ownerName.trim() },
                    { k: 'تليفون المعرض', v: phone.trim() },
                    { k: 'المحافظة والمنطقة', v: `${governorate} — ${area}` },
                    { k: 'العنوان', v: address.trim() },
                    { k: 'رقم السجل التجاري', v: commercialRegister.trim() },
                    { k: 'الرقم الضريبي', v: taxId.trim() },
                    { k: 'فحص فني', v: inspectionService ? 'بنقدّمه' : 'مش بنقدّمه' },
                    { k: 'ملاحظة التمويل', v: financingNote.trim() || 'مفيش' },
                  ].map((row) => (
                    <div key={row.k} className="border-b border-line pb-2 last:border-0">
                      <dt className="text-caption text-content-sub">{row.k}</dt>
                      <dd className="mt-0.5 text-sub font-bold text-content">{row.v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card>
                <SectionHeader title="الأوراق المرفقة" hint="كلها بتروح لفريق المراجعة بروابط موقّعة" />
                <ul className="space-y-2">
                  {[
                    { label: 'السجل التجاري', file: docs.commercial_register },
                    { label: 'البطاقة الضريبية', file: docs.tax_card },
                    { label: 'بطاقة المالك — الوش', file: docs.owner_id_front },
                    { label: 'بطاقة المالك — الضهر', file: docs.owner_id_back },
                    { label: 'لوجو المعرض', file: docs.logo ?? 'مفيش (اختياري)' },
                  ].map((d) => (
                    <li
                      key={d.label}
                      className="flex items-center justify-between gap-3 rounded-xs bg-surface-alt px-3.5 py-2.5"
                    >
                      <span className="text-sub text-content">{d.label}</span>
                      <span className="flex items-center gap-1.5 text-caption text-content-sub">
                        <Lock className="h-3.5 w-3.5" />
                        {d.file}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 rounded-xs bg-surface-alt px-3.5 py-2.5">
                    <span className="text-sub text-content">صور المعرض</span>
                    <span className="text-caption text-content-sub">
                      {withThousands(venueCount)} صورة
                    </span>
                  </li>
                </ul>
              </Card>

              <Card className="border-line-strong">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-content-sub">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-title text-content">اللي هيحصل بعد الإرسال</p>
                    <ol className="mt-2 space-y-1.5 text-sub text-content-sub">
                      <li>١. الطلب بيتسجّل بحالة «مقدَّم» وبيدخل طابور المراجعة.</li>
                      <li>٢. فريق CarQ بيراجع الأوراق في ٢ لـ ٣ أيام عمل.</li>
                      <li>
                        ٣. لو في حاجة ناقصة، الحالة بتبقى «محتاج استكمال» بسبب واضح والحقول
                        المطلوبة معلّمة.
                      </li>
                      <li>
                        ٤. الموافقة بتخلّي حسابك معرض. <span className="font-bold text-content">
                          التعاقد اللي بيفتح المزايدة قرار تاني منفصل.
                        </span>
                      </li>
                    </ol>
                    <p className="mt-3 text-caption text-content-faint">
                      في النسخة التجريبية الإرسال محلي. endpoints التقديم
                      (POST /v1/exhibitions/applications ورفع الأوراق) لسه مطلوبة في الباك.
                    </p>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {/* ───── التنقل ───── */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" onClick={goBack} disabled={step === 'data'} icon={<ArrowRight />}>
                السابق
              </Button>
              <div className="flex items-center gap-3">
                {touched && step === 'data' && !dataValid ? (
                  <span className="text-caption font-bold text-crit">
                    في حقول ناقصة أو غلط فوق
                  </span>
                ) : null}
                {touched && step === 'docs' && !docsValid ? (
                  <span className="text-caption font-bold text-crit">في أوراق ناقصة فوق</span>
                ) : null}
                {step === 'review' ? (
                  <Button icon={<Send />} onClick={submit} loading={sending}>
                    ابعت الطلب
                  </Button>
                ) : (
                  <Button onClick={goNext} iconEnd={<ArrowLeft />}>
                    التالي
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <p className="pb-2 text-center text-caption text-content-faint">
            <Building2 className="me-1 inline h-3.5 w-3.5" />
            عندك طلب مقدَّم قبل كده؟{' '}
            <Link href="/apply/status" className="font-bold text-accent">
              شوف حالته
            </Link>
          </p>
        </div>
      </Sheet>
    </main>
  );
}
