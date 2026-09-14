'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Camera,
  Car,
  FileSignature,
  ImageIcon,
  Info,
  Lock,
  MapPin,
  Save,
  ShieldCheck,
  Users,
  Wrench,
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
  Monogram,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Textarea,
  useToast,
  withThousands,
  validateFile,
  ACCEPTED_IMAGE_TYPES,
} from '@carq/ui';
import { errorMessage, useCatalog, useMyExhibition, useUpdateMyExhibition } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/profile` — ملف المعرض العام (EXHIBITION_PORTAL_SPEC §4.7)
 *
 * ده اللي المشتري بيشوفه في التطبيق لما يفتح صفحة المعرض.
 *
 * **العَلَمين `verified` و`is_contracted` للعرض فقط.** ممنوع أي مفتاح
 * يعدّلهم هنا: الأول شارة ثقة بيمنحها الأدمن، والتاني قرار تعاقد
 * بيفتح المزايدة — أخطر صلاحية في النظام (A-0). معروضين كشارات
 * مقفولة بشرح، مش كمفاتيح مقفولة بسكوت.
 * ════════════════════════════════════════════════════════════════
 */

const COVER_SLOTS = ['الصورة الأساسية', 'صورة ٢', 'صورة ٣'];

export default function ProfilePage() {
  const toast = useToast();
  const exhibition = useMyExhibition();
  const update = useUpdateMyExhibition();
  const ex = exhibition.data;

  const [name, setName] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [area, setArea] = useState('');
  const [financingNote, setFinancingNote] = useState('');
  const [inspectionService, setInspectionService] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [covers, setCovers] = useState<Array<string | null>>([null, null, null]);

  const pickProfileImage = (file: File, onOk: (name: string) => void) => {
    const error = validateFile(file, { acceptedTypes: ACCEPTED_IMAGE_TYPES });
    if (error) {
      toast({ tone: 'crit', title: 'الصورة مرفوضة', body: error });
      return;
    }
    onOk(file.name);
  };

  useEffect(() => {
    if (!ex) return;
    setName(ex.name);
    setGovernorate(ex.governorate);
    setArea(ex.area);
    setFinancingNote(ex.financingNote ?? '');
    setInspectionService(ex.inspectionService);
  }, [ex]);

  /** المحافظات والمناطق من الكتالوج — القايمة الحالية بتفضل خيار لحد ما يوصل */
  const catalog = useCatalog();
  const governorates = useMemo(() => {
    const list = catalog.data?.governorates ?? [];
    return governorate && !list.includes(governorate) ? [governorate, ...list] : list;
  }, [catalog.data, governorate]);
  const areas = useMemo(() => {
    const list = catalog.data?.areasByGov[governorate] ?? [];
    return area && !list.includes(area) ? [area, ...list] : list;
  }, [catalog.data, governorate, area]);

  const nameError =
    name.trim().length > 0 && (name.trim().length < 3 || name.trim().length > 160)
      ? 'اسم المعرض لازم يكون من ٣ لـ ١٦٠ حرف'
      : undefined;

  const dirty =
    Boolean(ex) &&
    (name !== ex!.name ||
      governorate !== ex!.governorate ||
      area !== ex!.area ||
      financingNote !== (ex!.financingNote ?? '') ||
      inspectionService !== ex!.inspectionService);

  const canSave = dirty && !nameError && name.trim().length >= 3;

  const save = async () => {
    if (!canSave) return;
    try {
      await update.mutateAsync({
        name: name.trim(),
        governorate,
        area,
        financingNote: financingNote.trim(),
        inspectionService,
      });
      toast({
        title: 'الملف اتحدّث',
        body: 'التعديلات هتبان للمشترين في التطبيق على طول.',
        tone: 'ok',
      });
    } catch (e) {
      toast({ title: 'مقدرناش نحفظ', body: errorMessage(e), tone: 'crit' });
    }
  };

  const reset = () => {
    if (!ex) return;
    setName(ex.name);
    setGovernorate(ex.governorate);
    setArea(ex.area);
    setFinancingNote(ex.financingNote ?? '');
    setInspectionService(ex.inspectionService);
  };

  return (
    <>
      <PageHeader
        title="ملف المعرض"
        subtitle="ده اللي المشتري بيشوفه في تطبيق CarQ لما يفتح صفحة معرضك"
        motif="circle"
        actions={
          <Button
            variant="white"
            size="sm"
            icon={<Save />}
            onClick={save}
            loading={update.isPending}
            disabled={!canSave}
          >
            احفظ التعديلات
          </Button>
        }
      />

      <Sheet>
        <Banner
          tone="neutral"
          icon={<Info />}
          title="مطلوب في الباك: PATCH /v1/exhibitions/me"
          className="mb-6 animate-rise"
        >
          الموجود دلوقتي PATCH /v1/me وبياخد الاسم والمنطقة بس. حقول المعرض (المحافظة، ملاحظة
          التمويل، خدمة الفحص) محتاجة endpoint منفصل، واللوجو وصور الغلاف محتاجين
          POST /v1/exhibitions/me/logo و /cover بـmultipart.
        </Banner>

        {exhibition.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-72" />
          </div>
        ) : exhibition.error || !ex ? (
          <Card padded={false}>
            <ErrorState
              message={errorMessage(exhibition.error)}
              onRetry={() => exhibition.refetch()}
            />
          </Card>
        ) : (
          <>
            {/* ───── العلمين المقفولين ───── */}
            <SectionHeader
              title="حالة المعرض"
              hint="الاتنين دول قرار أدمن — معروضين هنا للعلم مش للتعديل"
            />
            <div className="mb-9 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card className={ex.verified ? 'border-ok/30' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-title text-content">
                      <ShieldCheck
                        className={ex.verified ? 'h-5 w-5 text-ok' : 'h-5 w-5 text-content-faint'}
                      />
                      معرض موثّق
                    </p>
                    <p className="mt-1.5 text-sub text-content-sub">
                      شارة الثقة دي بيمنحها فريق CarQ بعد مراجعة السجل التجاري والبطاقة الضريبية.
                      مفيش مفتاح هنا يشغّلها — شارة بيديها صاحبها لنفسه مابتساويش حاجة عند المشتري.
                    </p>
                  </div>
                  <Badge tone={ex.verified ? 'ok' : 'neutral'} icon={<Lock />}>
                    {ex.verified ? 'موثّق' : 'مش موثّق'}
                  </Badge>
                </div>
              </Card>

              <Card className={ex.isContracted ? 'border-ok/30' : 'border-accent/30'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-title text-content">
                      <FileSignature
                        className={
                          ex.isContracted ? 'h-5 w-5 text-ok' : 'h-5 w-5 text-accent'
                        }
                      />
                      التعاقد
                    </p>
                    <p className="mt-1.5 text-sub text-content-sub">
                      العقد هو اللي بيفتح المزايدة في مزادات CarQ. قرار تجاري بين المعرض
                      والشركة — مش إعداد في الملف.
                    </p>
                  </div>
                  <Badge tone={ex.isContracted ? 'ok' : 'accent'} icon={<Lock />}>
                    {ex.isContracted ? 'متعاقد' : 'مش متعاقد'}
                  </Badge>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
              {/* ───── الفورم ───── */}
              <div className="space-y-4">
                <Card>
                  <SectionHeader title="بيانات المعرض" hint="الاسم والمكان اللي بيوصل للمشتري" />
                  <div className="space-y-4">
                    <Field label="اسم المعرض" required error={nameError} hint="من ٣ لـ ١٦٠ حرف">
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        invalid={Boolean(nameError)}
                        placeholder="اسم المعرض زي ما هو على اللافتة"
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="المحافظة" required>
                        <Select
                          value={governorate}
                          onChange={(e) => {
                            setGovernorate(e.target.value);
                            setArea('');
                          }}
                        >
                          <option value="">اختار المحافظة</option>
                          {governorates.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <Field label="المنطقة" required>
                        {areas.length ? (
                          <Select value={area} onChange={(e) => setArea(e.target.value)}>
                            <option value="">اختار المنطقة</option>
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
                            placeholder="اكتب اسم المنطقة"
                          />
                        )}
                      </Field>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="الصور" hint="اللوجو وصور المعرض اللي بتظهر فوق صفحتك" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FileDrop
                      label="لوجو المعرض"
                      hint="مربع ويفضل خلفية بيضا · حد أقصى ١٠ ميجا"
                      accept="image/*"
                      icon={<ImageIcon />}
                      fileName={logoName}
                      onPick={(f) => pickProfileImage(f, setLogoName)}
                    />
                    {COVER_SLOTS.map((slot, i) => (
                      <FileDrop
                        key={slot}
                        label={`صورة الغلاف — ${slot}`}
                        hint="عرضية · حد أقصى ١٠ ميجا"
                        accept="image/*"
                        icon={<Camera />}
                        fileName={covers[i]}
                        onPick={(f) =>
                          pickProfileImage(f, (name) =>
                            setCovers((prev) => prev.map((c, k) => (k === i ? name : c))),
                          )
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-caption text-content-faint">
                    الصور بتتحفظ لما endpoints الرفع تتبني. لحد ساعتها الاختيار هنا بيتسجّل عندك
                    في الصفحة بس — مش بيروح للسيرفر.
                  </p>
                </Card>

                <Card>
                  <SectionHeader title="خدمات المعرض" hint="اللي بيفرق للمشتري وهو بيقارن" />
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
                      hint="اكتبها بلغة المشتري: المقدم والمدة والشريك — من غير وعود مش مضمونة"
                    >
                      <Textarea
                        rows={4}
                        value={financingNote}
                        onChange={(e) => setFinancingNote(e.target.value)}
                        placeholder="مثال: تقسيط لحد ٦٠ شهر بمقدم ٣٠٪ من خلال شركاء التمويل"
                      />
                    </Field>
                  </div>
                </Card>

                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sub text-content-sub">
                      {dirty ? 'في تعديلات لسه ماتحفظتش.' : 'الملف محفوظ زي ما هو.'}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={reset} disabled={!dirty}>
                        رجّع القديم
                      </Button>
                      <Button
                        icon={<Save />}
                        onClick={save}
                        loading={update.isPending}
                        disabled={!canSave}
                      >
                        احفظ التعديلات
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ───── المعاينة ───── */}
              <div className="space-y-4">
                <Card className="lg:sticky lg:top-6">
                  <SectionHeader title="معاينة" hint="الشكل التقريبي في التطبيق" />
                  <div className="overflow-hidden rounded-md border border-line">
                    <div className="flex h-28 items-center justify-center bg-muted-soft text-content-faint">
                      {covers[0] ? (
                        <span className="flex items-center gap-2 text-caption">
                          <Camera className="h-4 w-4" />
                          {covers[0]}
                        </span>
                      ) : ex.coverUrl ? (
                        <img src={ex.coverUrl} alt="" className="h-28 w-full object-cover" />
                      ) : (
                        <span className="flex items-center gap-2 text-caption">
                          <ImageIcon className="h-4 w-4" />
                          مفيش صورة غلاف
                        </span>
                      )}
                    </div>
                    <div className="bg-surface px-4 pb-4 pt-3">
                      <div className="flex items-center gap-3">
                        <Monogram text={(name || ex.name).slice(0, 2)} size={44} />
                        <div className="min-w-0">
                          <p className="truncate text-title text-content">{name || ex.name}</p>
                          <p className="flex items-center gap-1 text-caption text-content-sub">
                            <MapPin className="h-3 w-3" />
                            {area || ex.area} · {governorate || ex.governorate}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {ex.verified ? (
                          <Badge tone="ok" icon={<BadgeCheck />}>
                            معرض موثّق
                          </Badge>
                        ) : null}
                        {inspectionService ? (
                          <Badge tone="accent" icon={<Wrench />}>
                            فحص فني
                          </Badge>
                        ) : null}
                        <Badge tone="neutral" icon={<Car />}>
                          {withThousands(ex.listingsCount)} عربية
                        </Badge>
                      </div>

                      {financingNote.trim() ? (
                        <p className="mt-3 rounded-xs bg-surface-alt px-3 py-2 text-caption text-content-sub">
                          {financingNote.trim()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-caption text-content-faint">
                    التوثيق والتعاقد مش بيتغيّروا من هنا، فالمعاينة بتعرضهم بحالتهم الحالية.
                  </p>
                </Card>

                <Card>
                  <p className="flex items-center gap-2 text-title text-content">
                    <Users className="h-5 w-5 text-content-sub" />
                    الفريق
                  </p>
                  <p className="mt-1.5 text-sub text-content-sub">
                    دلوقتي حساب واحد للمعرض كله — كل الموظفين بيتشاركوا نفس التليفون. ده مقبول
                    للإطلاق ومش مقبول بعديه: مزايدة بفلوس لازم تبقى منسوبة لشخص. أدوار الفريق
                    (مالك · مزايد · مشاهد) مرحلة تانية.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <Monogram text={ex.ownerName.slice(0, 1)} size={36} dark />
                    <div className="min-w-0">
                      <p className="truncate text-sub font-bold text-content">{ex.ownerName}</p>
                      <p className="text-caption text-content-sub">
                        <Building2 className="me-1 inline h-3 w-3" />
                        المالك · الحساب الوحيد
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
