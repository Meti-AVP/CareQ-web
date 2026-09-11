'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Car,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  History,
  ImageOff,
  Lock,
  Minus,
  Phone,
  ScrollText,
  ShieldCheck,
  TimerOff,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Monogram,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  Switch,
  divergingColor,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  formatKm,
  formatPct,
  maskPhone,
  relTimeAr,
  useToast,
  withThousands,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useAudit,
  useListing,
  useSetListingFlags,
  useSetListingStatus,
  type AuditEntry,
  type ListingStatus,
  type PriceTag,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/listings/[id]` — تفاصيل الإعلان + شارات الثقة
 * (ADMIN_DASHBOARD_SPEC §4.3)
 *
 * الصفحة دي هي **المسار الوحيد** لمنح «ممشى موثّق» و«مفحوص»
 * (T-1 · T-2 · X-10) — الشارتين ممنوعين من أي endpoint بيستخدمه
 * البائع، لأن الشارة اللي البائع بيمنحها لنفسه مش شارة ثقة.
 *
 * فالـUI هنا **بيفرض التفكير مش مجرد toggle**:
 *  · الصور جنب المفتاح، والشرح صريح إن الشارة معناها إن CarQ قرت
 *    العداد من صورة — مش إن البائع كتب الرقم.
 *  · سبب مكتوب إجباري قبل أي تفعيل → بيروح لـaudit_log.payload.
 *  · تاريخ التغييرات تحت المفاتيح مباشرة — القرار بيفضل مرئي.
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

const TAG_META = {
  deal: { label: 'لقطة', tone: 'ok' as Tone, Icon: TrendingDown },
  fair: { label: 'سعر عادل', tone: 'neutral' as Tone, Icon: Minus },
  high: { label: 'أعلى من السوق', tone: 'warn' as Tone, Icon: TrendingUp },
};

const ACTION_LABELS: Record<string, string> = {
  'listing.flags_changed': 'تغيير شارات الثقة',
  'listing.status_changed': 'تغيير حالة الإعلان',
};

/**
 * الصور المحلية في `public/cars`. العقد الحالي بيرجّع صورة واحدة
 * (`imageUrl`) — لما الباك يرجّع مصفوفة صور الإعلان، بدّل المصدر ده بيها
 * والمعرض هيشتغل زي ما هو.
 */
const PHOTO_POOL = [
  '/cars/accent.jpg',
  '/cars/corolla.jpg',
  '/cars/tucson.jpg',
  '/cars/sportage.jpg',
  '/cars/c180.jpg',
  '/cars/320i.jpg',
  '/cars/tiggo.jpg',
  '/cars/mg5.jpg',
  '/cars/duster.jpg',
  '/cars/octavia.jpg',
];

/** أقصى انحراف معروض على مؤشر السعر — بعده المؤشر بيقف في الطرف */
const DIFF_SCALE = 25;

function auditSummary(entry: AuditEntry): string | null {
  if (entry.action === 'listing.flags_changed') {
    const after = entry.payload.after as
      | { kmVerified?: boolean; inspected?: boolean }
      | undefined;
    const parts: string[] = [];
    if (after?.kmVerified !== undefined)
      parts.push(`ممشى موثّق: ${after.kmVerified ? 'اتفعّلت' : 'اتسحبت'}`);
    if (after?.inspected !== undefined)
      parts.push(`مفحوص: ${after.inspected ? 'اتفعّلت' : 'اتسحبت'}`);
    return parts.length ? parts.join(' · ') : null;
  }
  if (entry.action === 'listing.status_changed') {
    const before = entry.payload.before as ListingStatus | undefined;
    const after = entry.payload.after as ListingStatus | undefined;
    if (before && after) {
      return `${STATUS_META[before]?.label ?? before} ← ${STATUS_META[after]?.label ?? after}`;
    }
  }
  return null;
}

function auditReason(entry: AuditEntry): string | null {
  const reason = entry.payload.reason ?? entry.payload.note;
  return typeof reason === 'string' && reason.trim() ? reason : null;
}

function TagBadge({ tag }: { tag: PriceTag }) {
  const t = TAG_META[tag];
  return (
    <Badge tone={t.tone} icon={<t.Icon />}>
      {t.label}
    </Badge>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-content-faint">{label}</p>
      <p className="mt-0.5 truncate text-body font-bold text-content">{value}</p>
    </div>
  );
}

type FlagKey = 'kmVerified' | 'inspected';

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const toast = useToast();

  const listing = useListing(id);
  const audit = useAudit({ entityType: 'listing', entityId: id });
  const setFlags = useSetListingFlags();
  const setStatus = useSetListingStatus();

  const [photoIndex, setPhotoIndex] = useState(0);
  const [pendingFlag, setPendingFlag] = useState<{ key: FlagKey; next: boolean } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<'rejected' | 'removed' | null>(null);

  const l = listing.data;

  /** معرض الصور — أول صورة هي صورة الإعلان الحقيقية */
  const photos = useMemo(() => {
    if (!l || !l.imageUrl || l.photosCount === 0) return [];
    const count = Math.min(Math.max(l.photosCount, 1), 5);
    const offset = Number(l.id.replace(/\D/g, '')) || 0;
    const rest = PHOTO_POOL.filter((p) => p !== l.imageUrl);
    return [
      l.imageUrl,
      ...Array.from({ length: count - 1 }, (_, i) => rest[(offset + i) % rest.length]!),
    ];
  }, [l]);

  const diffPct = l && l.marketAvg ? ((l.price - l.marketAvg) / l.marketAvg) * 100 : null;
  const auditRows = audit.data?.items ?? [];

  const confirmFlag = async (reason: string) => {
    if (!pendingFlag || !l) return;
    const flags =
      pendingFlag.key === 'kmVerified'
        ? { kmVerified: pendingFlag.next }
        : { inspected: pendingFlag.next };
    try {
      await setFlags.mutateAsync({ id: l.id, flags, reason });
      toast({
        title: pendingFlag.next ? 'الشارة اتفعّلت' : 'الشارة اتسحبت',
        body: 'التغيير والسبب اتسجّلوا في سجل التدقيق.',
        tone: 'ok',
      });
      setPendingFlag(null);
    } catch (err) {
      toast({ title: errorMessage(err), tone: 'crit' });
    }
  };

  const confirmStatus = async (reason: string) => {
    if (!pendingStatus || !l) return;
    try {
      await setStatus.mutateAsync({ id: l.id, status: pendingStatus, reason });
      toast({
        title: pendingStatus === 'rejected' ? 'الإعلان اترفض' : 'الإعلان اتشال',
        body: 'السبب اتسجّل في سجل التدقيق ومابيتمسحش.',
        tone: 'ok',
      });
      setPendingStatus(null);
    } catch (err) {
      toast({ title: errorMessage(err), tone: 'crit' });
    }
  };

  /* ───────── تحميل ───────── */
  if (listing.isLoading) {
    return (
      <>
        <PageHeader title="تفاصيل الإعلان" subtitle="بنجيب بيانات الإعلان…" motif="swoosh" />
        <Sheet>
          <div className="grid gap-4 xl:grid-cols-3">
            <Skeleton className="h-[320px] xl:col-span-2" />
            <Skeleton className="h-[320px]" />
          </div>
          <Skeleton className="mt-4 h-[280px]" />
        </Sheet>
      </>
    );
  }

  /* ───────── خطأ ───────── */
  if (listing.isError || !l) {
    return (
      <>
        <PageHeader title="تفاصيل الإعلان" subtitle="مقدرناش نفتح الإعلان ده" motif="swoosh" />
        <Sheet>
          <Card>
            <ErrorState message={errorMessage(listing.error)} onRetry={() => listing.refetch()} />
            <div className="flex justify-center">
              <Button variant="outline" icon={<ArrowRight />} onClick={() => router.push('/listings')}>
                ارجع لكل الإعلانات
              </Button>
            </div>
          </Card>
        </Sheet>
      </>
    );
  }

  const meta = STATUS_META[l.status];

  return (
    <>
      <PageHeader
        title={`${l.title} ${l.year}`}
        subtitle={`${l.seller.name} · ${l.governorate} — ${l.area}`}
        motif="swoosh"
        actions={
          <Button variant="white" size="sm" icon={<ArrowRight />} onClick={() => router.push('/listings')}>
            كل الإعلانات
          </Button>
        }
      />

      <Sheet>
        {/* ───── حالات محتاجة شرح فوري ───── */}
        {l.status === 'draft' ? (
          <Banner tone="warn" icon={<EyeOff />} title="الإعلان ده مسودة — محدش شايفه" className="mb-5">
            الإعلان بينشر كـ«مسودة» وأول صورة هي اللي بتفعّله (D-2).
            {l.photosCount === 0
              ? ' الإعلان ده من غير ولا صورة، فهو مقفول على صاحبه: مفيش مشاهدات ولا رسايل.'
              : ' الصور موجودة بس الإعلان لسه ما اتفعّلش — يستاهل بصّة على الـworker.'}
          </Banner>
        ) : null}

        {l.status === 'rejected' && l.rejectionReason ? (
          <Banner tone="crit" icon={<XCircle />} title="الإعلان مرفوض" className="mb-5">
            سبب الرفض المسجّل: {l.rejectionReason}
          </Banner>
        ) : null}

        {/* ───── المعرض + السعر ───── */}
        <div className="mb-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <SectionHeader
              title="صور الإعلان"
              hint={`${withThousands(l.photosCount)} صورة — الصور هي مصدر أي قراءة نعملها للعداد`}
              action={
                <Badge tone={meta.tone} icon={<meta.Icon />}>
                  {meta.label}
                </Badge>
              }
            />

            {photos.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[photoIndex]}
                  alt={`${l.title} ${l.year}`}
                  className="aspect-[16/9] w-full rounded-md object-cover"
                />
                {photos.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <button
                        key={`${p}-${i}`}
                        type="button"
                        onClick={() => setPhotoIndex(i)}
                        aria-label={`صورة ${i + 1}`}
                        aria-pressed={i === photoIndex}
                        className={
                          i === photoIndex
                            ? 'overflow-hidden rounded-xs ring-2 ring-accent'
                            : 'overflow-hidden rounded-xs opacity-70 transition-opacity hover:opacity-100'
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" className="h-14 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<ImageOff />}
                title="الإعلان ده من غير صور"
                hint="من غير صورة واحدة الإعلان مايتفعّلش، ومفيش أي طريقة نقرا بيها العداد — فشارة «ممشى موثّق» مقفولة."
              />
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <p className="text-caption text-content-sub">سعر الإعلان</p>
              <p className="tnum mt-0.5 text-h1 text-content">{formatEGP(l.price)}</p>

              <div className="mt-4 border-t border-line pt-4">
                {l.marketAvg === null || diffPct === null ? (
                  <div className="rounded-md bg-muted-soft px-3.5 py-3">
                    <p className="flex items-center gap-2 text-sub font-bold text-content">
                      <Minus className="h-4 w-4 text-content-sub" />
                      مش متسعّر
                    </p>
                    <p className="mt-1 text-caption text-content-sub">
                      محرك التسعير لسه مامعاهوش مقارنات كفاية للعربية دي (P-4). ده مش صفر ومش خطأ —
                      يعني بس إن مفيش متوسط سوق نقارن بيه دلوقتي.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-caption text-content-sub">متوسط السوق</span>
                      <span className="tnum text-body font-bold text-content">
                        {formatEGP(l.marketAvg)}
                      </span>
                    </div>

                    {/* مؤشر متباعد: تيل تحت السوق، برتقالي فوقه، رمادي في النص */}
                    <div className="relative mt-5 h-2 rounded-full bg-muted-soft">
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 h-4 w-px bg-line-strong"
                        style={{ insetInlineStart: '50%' }}
                      />
                      <span
                        className="absolute -top-1.5 h-5 w-5 rounded-full border-2 border-white shadow-pop"
                        style={{
                          insetInlineStart: `calc(${
                            50 + Math.max(-1, Math.min(1, diffPct / DIFF_SCALE)) * 50
                          }% - 10px)`,
                          backgroundColor: divergingColor(diffPct, DIFF_SCALE),
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-caption text-content-faint">
                      <span>أرخص من السوق</span>
                      <span>المتوسط</span>
                      <span>أغلى من السوق</span>
                    </div>

                    <p className="tnum mt-3 text-sub font-bold text-content">
                      {formatPct(diffPct)} عن متوسط السوق
                    </p>
                    {l.priceTag ? (
                      <div className="mt-2">
                        <TagBadge tag={l.priceTag} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="الإحصائيات" className="mb-3" />
              <div className="grid grid-cols-2 gap-4">
                <Spec label="المشاهدات" value={withThousands(l.viewsCount)} />
                <Spec label="عدد الصور" value={withThousands(l.photosCount)} />
                <Spec
                  label="اتنشر"
                  value={l.publishedAt ? relTimeAr(l.publishedAt) : 'لسه ما اتنشرش'}
                />
                <Spec
                  label="بينتهي في"
                  value={l.expiresAt ? formatDateAr(l.expiresAt) : 'مفيش تاريخ انتهاء'}
                />
              </div>
            </Card>
          </div>
        </div>

        {/* ═════ شارات الثقة — أهم جزء في الصفحة ═════ */}
        <Card className="mb-4">
          <SectionHeader
            title="شارات الثقة"
            hint="أهم إشارتين ثقة في المنتج — والصفحة دي هي المسار الوحيد لمنحهم"
            action={
              <div className="flex items-center gap-2">
                <Badge tone={l.kmVerified ? 'ok' : 'neutral'} icon={<ShieldCheck />}>
                  {l.kmVerified ? 'ممشى موثّق' : 'مش موثّق'}
                </Badge>
                <Badge tone={l.inspected ? 'ok' : 'neutral'} icon={<Wrench />}>
                  {l.inspected ? 'مفحوص' : 'مش مفحوص'}
                </Badge>
              </div>
            }
          />

          <Banner tone="accent" icon={<Lock />} title="الشارتين دول ممنوعين من أي endpoint بيستخدمه البائع">
            قاعدة T-1 و T-2 و X-10: البائع مايقدرش يمنح نفسه شارة — ولا من التطبيق ولا من أي مسار
            تاني. الصفحة دي هي المسار الوحيد، وكل تغيير بيتسجّل باسمك وسببه.
          </Banner>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* ───── ممشى موثّق ───── */}
            <div className="rounded-md border border-line bg-surface-alt p-4">
              <Switch
                checked={l.kmVerified}
                disabled={setFlags.isPending}
                onChange={(v) => setPendingFlag({ key: 'kmVerified', next: v })}
                label="ممشى موثّق"
                hint="بتظهر للمشتري جنب العداد في التطبيق"
                tone="ok"
              />

              <div className="mt-4 rounded-sm border border-warn/25 bg-warn-soft px-3.5 py-3">
                <p className="flex items-start gap-2 text-sub text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  الشارة دي معناها إن <b>CarQ قرت العداد من صورة</b> — مش إن البائع كتب الرقم. لو
                  فعّلتها والرقم غلط، إحنا اللي ضمنّا الغلط قدام المشتري.
                </p>
              </div>

              <p className="tnum mt-4 text-sub text-content-sub">
                العداد المكتوب في الإعلان: <b className="text-content">{formatKm(l.km)}</b>
              </p>

              {photos.length > 0 ? (
                <>
                  <p className="mt-3 text-caption text-content-sub">
                    اقرا الرقم من صور الإعلان نفسها قبل ما تفعّل — القراءة الآلية من مهام السكان لسه
                    مش متسجّلة في عقد الإعلان.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photos.slice(0, 4).map((p, i) => (
                      <button
                        key={`km-${p}-${i}`}
                        type="button"
                        onClick={() => setPhotoIndex(i)}
                        aria-label={`افتح صورة ${i + 1}`}
                        className="overflow-hidden rounded-xs border border-line transition-opacity hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" className="h-12 w-[68px] object-cover" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-caption font-bold text-crit">
                  <ImageOff className="h-4 w-4" />
                  مفيش صور للإعلان ده — يعني مفيش أي قراءة ممكنة للعداد.
                </p>
              )}
            </div>

            {/* ───── مفحوص ───── */}
            <div className="rounded-md border border-line bg-surface-alt p-4">
              <Switch
                checked={l.inspected}
                disabled={setFlags.isPending}
                onChange={(v) => setPendingFlag({ key: 'inspected', next: v })}
                label="مفحوص"
                hint="بتظهر للمشتري كشارة فحص فني على الإعلان"
                tone="ok"
              />

              <div className="mt-4 rounded-sm border border-warn/25 bg-warn-soft px-3.5 py-3">
                <p className="flex items-start gap-2 text-sub text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  فعّلها بس لو <b>فيه تقرير فحص فني وصلك وراجعته</b>. كلام البائع إن العربية
                  «فابريكا بالكامل» مش فحص.
                </p>
              </div>

              <p className="mt-4 text-sub text-content-sub">
                اكتب في السبب مين الجهة اللي فحصت وتاريخ الفحص — السبب ده هو الأثر الوحيد اللي
                هيرجعله أي حد يراجع القرار بعدين.
              </p>

              <div className="mt-4 flex flex-wrap gap-3 text-caption text-content-sub">
                <span className="inline-flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" />
                  {l.make} {l.model} · {l.year}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {withThousands(l.viewsCount)} مشاهدة
                </span>
              </div>
            </div>
          </div>

          {/* ───── تاريخ التغييرات — تحت المفاتيح مباشرة ───── */}
          <div className="mt-6 border-t border-line pt-5">
            <SectionHeader
              title="تاريخ التغييرات"
              hint="سجل تدقيق append-only — مابيتمسحش ومفيش أكشن حذف عليه (X-6)"
              className="mb-3"
            />

            {audit.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : audit.isError ? (
              <ErrorState message={errorMessage(audit.error)} onRetry={() => audit.refetch()} />
            ) : auditRows.length === 0 ? (
              <EmptyState
                icon={<ScrollText />}
                title="لسه مفيش تغييرات على الإعلان ده"
                hint="أول تفعيل لشارة أو تغيير حالة هيظهر هنا باسم اللي عمله وسببه ووقته بتوقيت القاهرة."
              />
            ) : (
              <ol className="space-y-4 border-s border-line ps-5">
                {auditRows.map((entry) => {
                  const summary = auditSummary(entry);
                  const reason = auditReason(entry);
                  return (
                    <li key={entry.id} className="relative animate-fade">
                      <span
                        aria-hidden="true"
                        className="absolute -start-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-surface"
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-body font-bold text-content">
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </p>
                        <span className="text-caption text-content-faint">
                          {formatDateTimeAr(entry.createdAt)}
                        </span>
                      </div>
                      {summary ? (
                        <p className="mt-0.5 text-sub text-content-sub">{summary}</p>
                      ) : null}
                      {reason ? (
                        <p className="mt-1 rounded-sm bg-surface-alt px-3 py-2 text-sub text-content">
                          {reason}
                        </p>
                      ) : null}
                      <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-content-faint">
                        <History className="h-3.5 w-3.5" />
                        {entry.actorName}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Card>

        {/* ───── المواصفات + البائع ───── */}
        <div className="mb-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <SectionHeader title="المواصفات" className="mb-4" />
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Spec label="الماركة" value={l.make} />
              <Spec label="الموديل" value={l.model} />
              <Spec label="السنة" value={String(l.year)} />
              <Spec label="ناقل الحركة" value={l.transmission} />
              <Spec label="نوع الهيكل" value={l.body} />
              <Spec label="اللون" value={l.color} />
              <Spec label="العداد" value={formatKm(l.km)} />
              <Spec label="المنطقة" value={`${l.governorate} — ${l.area}`} />
              <Spec label="اتعمل في" value={formatDateAr(l.createdAt)} />
              <Spec
                label="اتنشر في"
                value={l.publishedAt ? formatDateAr(l.publishedAt) : 'لسه ما اتنشرش'}
              />
              <Spec
                label="بينتهي في"
                value={l.expiresAt ? formatDateAr(l.expiresAt) : 'مفيش'}
              />
              <Spec label="الحالة" value={meta.label} />
            </div>
            <p className="mt-5 border-t border-line pt-4 text-sub text-content-sub">
              {l.description}
            </p>
          </Card>

          <Card>
            <SectionHeader title="البائع" className="mb-4" />
            <div className="flex items-center gap-3">
              <Monogram text={l.seller.name.trim().charAt(0)} size={44} />
              <div className="min-w-0">
                <p className="truncate text-title text-content">{l.seller.name}</p>
                <Badge tone={l.seller.role === 'exhibition' ? 'accent' : 'neutral'} icon={<User />}>
                  {l.seller.role === 'exhibition' ? 'معرض' : l.seller.role === 'admin' ? 'أدمن' : 'فرد'}
                </Badge>
              </div>
            </div>

            <div className="mt-4 rounded-md bg-surface-alt px-3.5 py-3">
              <p className="tnum flex items-center gap-2 text-body font-bold text-content">
                <Phone className="h-4 w-4 text-content-sub" />
                {maskPhone(l.seller.phone)}
              </p>
              <p className="mt-1 text-caption text-content-sub">
                الرقم مخفي جزئيًا افتراضيًا. كشفه أكشن واعٍ وبيتسجّل في سجل التدقيق (§10.2).
              </p>
            </div>

            <Link
              href={`/listings?q=${encodeURIComponent(l.seller.name)}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sub font-bold text-accent hover:underline"
            >
              <Car className="h-4 w-4" />
              كل إعلانات البائع ده
            </Link>
          </Card>
        </div>

        {/* ───── أكشنات الحالة ───── */}
        <Card>
          <SectionHeader
            title="أكشنات الحالة"
            hint="الاتنين دول بيشيلوا الإعلان من قدام المشترين — وبيحتاجوا سبب مكتوب"
            className="mb-4"
          />

          <Banner tone="warn" icon={<AlertTriangle />} title="الـendpoints دي لسه ناقصة في الباك (§6.2)">
            الباك اند لسه مافيهوش مسار للمراجعة (رفض الإعلان) ولا للحذف الإداري (شيل الإعلان).
            الزرارين دول شغالين دلوقتي على طبقة الموك: التغيير والسبب بيتسجّلوا محليًا لحد ما
            المسارات تتبني — ووقتها مش هتتغير ولا شاشة.
          </Banner>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="danger"
              icon={<XCircle />}
              disabled={l.status === 'rejected' || setStatus.isPending}
              onClick={() => setPendingStatus('rejected')}
            >
              ارفض الإعلان
            </Button>
            <Button
              variant="outline"
              icon={<Trash2 />}
              disabled={l.status === 'removed' || setStatus.isPending}
              onClick={() => setPendingStatus('removed')}
            >
              شيل الإعلان
            </Button>
          </div>

          <p className="mt-3 text-caption text-content-sub">
            «ارفض» معناها الإعلان اتراجع واتقفل لمخالفة — والسبب بيوصل للبائع. «شيل» حذف إداري
            بيخفي الإعلان من غير حكم على المحتوى. مفيش حذف نهائي في CarQ — كل حاجة soft delete
            (X-6).
          </p>
        </Card>
      </Sheet>

      {/* ───── تأكيد شارة الثقة: سبب إجباري بيروح لسجل التدقيق ───── */}
      <ConfirmDialog
        open={pendingFlag !== null}
        onClose={() => setPendingFlag(null)}
        onConfirm={confirmFlag}
        loading={setFlags.isPending}
        tone={pendingFlag?.next ? 'accent' : 'crit'}
        confirmLabel={pendingFlag?.next ? 'فعّل الشارة' : 'اسحب الشارة'}
        title={
          pendingFlag?.key === 'inspected'
            ? pendingFlag.next
              ? 'تفعيل شارة «مفحوص»'
              : 'سحب شارة «مفحوص»'
            : pendingFlag?.next
              ? 'تفعيل شارة «ممشى موثّق»'
              : 'سحب شارة «ممشى موثّق»'
        }
        impact={
          pendingFlag?.key === 'inspected'
            ? pendingFlag.next
              ? 'المشتري هيقرا إن العربية اتفحصت فنيًا وCarQ شايفة التقرير. فعّلها بس لو التقرير وصلك فعلًا.'
              : 'الشارة هتختفي من الإعلان قدام كل المشترين، وأي حد كان بيعتمد عليها هيشوف الإعلان من غيرها.'
            : pendingFlag?.next
              ? 'المشتري هيقرا إن CarQ قرت العداد من صورة — مش إن البائع كتبه. لو الرقم غلط، الغلط بقى علينا إحنا.'
              : 'الشارة هتختفي من الإعلان، والعداد هيرجع «رقم البائع» زي أي إعلان عادي.'
        }
        reasonLabel="سبب القرار"
        reasonHint="بيتسجّل في audit_log.payload باسمك ووقته — ومابيتمسحش"
      >
        <div className="rounded-sm bg-surface-alt px-3.5 py-3">
          <p className="text-sub font-bold text-content">
            {l.title} {l.year}
          </p>
          <p className="tnum mt-0.5 text-caption text-content-sub">
            {formatKm(l.km)} · {formatEGP(l.price)} · {withThousands(l.photosCount)} صورة
          </p>
        </div>
      </ConfirmDialog>

      {/* ───── تأكيد تغيير الحالة ───── */}
      <ConfirmDialog
        open={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        onConfirm={confirmStatus}
        loading={setStatus.isPending}
        tone="crit"
        confirmLabel={pendingStatus === 'rejected' ? 'ارفض الإعلان' : 'شيل الإعلان'}
        title={pendingStatus === 'rejected' ? 'رفض الإعلان' : 'شيل الإعلان'}
        impact={
          pendingStatus === 'rejected'
            ? 'الإعلان هيختفي من التطبيق فورًا، والبائع هيشوف إنه اترفض ومعاه السبب اللي هتكتبه.'
            : 'الإعلان هيتشال من التطبيق من غير حكم على المحتوى. الرفض غير الشيل — اختار الصح عشان البائع يفهم اللي حصل.'
        }
        reasonLabel={pendingStatus === 'rejected' ? 'سبب الرفض' : 'سبب الشيل'}
        reasonHint="بيتسجّل في سجل التدقيق ومابيتمسحش — واللي بيراجع بعديك هيقراه"
      >
        <div className="rounded-sm bg-surface-alt px-3.5 py-3">
          <p className="text-sub font-bold text-content">
            {l.title} {l.year}
          </p>
          <p className="mt-0.5 text-caption text-content-sub">
            الحالة الحالية: {meta.label} · {l.seller.name}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
