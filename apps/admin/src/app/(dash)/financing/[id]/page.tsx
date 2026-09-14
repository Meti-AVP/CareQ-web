'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Car,
  CheckCircle2,
  FileClock,
  ImageOff,
  Inbox,
  Lock,
  PhoneCall,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  Countdown,
  Dialog,
  ErrorState,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  cn,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  formatPctPlain,
  hoursSince,
  maskPhone,
  useToast,
  waitingFor,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useFinancingApp,
  useSetFinancingStatus,
  useSignedIdImage,
  type FinancingStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/financing/[id]` — تفاصيل طلب تمويل
 * (ADMIN_DASHBOARD_SPEC §4.6 · §10.1 — الأمان مش قابل للتفاوض)
 *
 * **صور البطاقة:** `idFrontKey` و `idBackKey` **مفاتيح تخزين مش روابط**.
 * الباك بيرفض يطلّع رابط عام ليها. فالشاشة دي:
 *   · عمرها ما بتحط المفتاح في `<img src>` ولا بتبني رابط بإيدها
 *   · بتطلب رابط موقّع (٥ دقايق) وقت العرض بس — وكل فتحة بتتسجّل (F-6)
 *   · مفيش كاش ولا تنزيل: الرابط عايش في state الصفحة بس،
 *     وبيتمسح لما العداد يخلص أو الديالوج يتقفل
 *   · قانون حماية البيانات المصري ١٥١/٢٠٢٠ بينطبق على الداتا دي
 *
 * **الأرقام:** كلها من `quoteSnapshot` — لقطة وقت التقديم (F-4).
 * ممنوع نعيد حساب القسط من نسب جميل الحالية.
 * ════════════════════════════════════════════════════════════════
 */

const STATUS_META: Record<FinancingStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  submitted: { label: 'جديد', tone: 'accent', icon: <Inbox /> },
  contacted: { label: 'اتواصلنا', tone: 'neutral', icon: <PhoneCall /> },
  approved: { label: 'متوافق عليه', tone: 'ok', icon: <CheckCircle2 /> },
  rejected: { label: 'مرفوض', tone: 'crit', icon: <XCircle /> },
};

const PARTNER_LABELS: Record<string, string> = { jameel: 'جميل' };

const ACTIONS: Array<{
  status: FinancingStatus;
  label: string;
  title: string;
  impact: string;
  tone: 'crit' | 'accent';
}> = [
  {
    status: 'contacted',
    label: 'علّم إننا اتواصلنا',
    title: 'تعليم الطلب كـ«اتواصلنا»',
    impact:
      'ده بيقفل وعد الـ٢٤ ساعة المعروض للعميل. علّمه بس لما يكون فيه اتصال حقيقي حصل — الرقم ده بيتحسب في تقارير الالتزام بالـSLA.',
    tone: 'accent',
  },
  {
    status: 'approved',
    label: 'وافق على الطلب',
    title: 'الموافقة على طلب التمويل',
    impact:
      'الموافقة بتتسجّل باسمك في سجل التدقيق وبتتبلّغ للشريك بأرقام اللقطة المسجّلة وقت التقديم — مش بأي نسب جديدة.',
    tone: 'accent',
  },
  {
    status: 'rejected',
    label: 'ارفض الطلب',
    title: 'رفض طلب التمويل',
    impact:
      'الرفض بيقفل الطلب والعميل هيتبلّغ. بعد القفل صور البطاقة بتتمسح من التخزين ومش هتقدر تشوفها تاني.',
    tone: 'crit',
  },
];

export default function FinancingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const router = useRouter();
  const toast = useToast();
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());

  const app = useFinancingApp(id);
  const setStatus = useSetFinancingStatus();
  const signImage = useSignedIdImage();

  /** الرابط الموقّع عايش هنا بس — وبيتمسح لما ينتهي أو الديالوج يتقفل */
  const [viewer, setViewer] = useState<{ side: 'front' | 'back'; url: string; expiresAt: string } | null>(
    null,
  );
  const [pendingSide, setPendingSide] = useState<'front' | 'back' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [confirming, setConfirming] = useState<FinancingStatus | null>(null);

  const data = app.data;

  const openImage = (side: 'front' | 'back') => {
    setPendingSide(side);
    signImage.mutate(
      { id, side },
      {
        onSuccess: (res) => {
          setImageFailed(false);
          setViewer({ side, url: res.url, expiresAt: res.expiresAt });
          setPendingSide(null);
        },
        onError: (e) => {
          setPendingSide(null);
          toast({ title: errorMessage(e), tone: 'crit' });
        },
      },
    );
  };

  const action = ACTIONS.find((a) => a.status === confirming) ?? null;

  const applyStatus = (reason: string) => {
    if (!action) return;
    setStatus.mutate(
      { id, status: action.status, reason },
      {
        onSuccess: () => {
          setConfirming(null);
          toast({ title: 'اتحدّثت حالة الطلب', body: 'السبب اتسجّل في سجل التدقيق', tone: 'ok' });
        },
        onError: (e) => toast({ title: errorMessage(e), tone: 'crit' }),
      },
    );
  };

  const late = data?.status === 'submitted' && hoursSince(data.createdAt, now) >= 24;

  return (
    <>
      <PageHeader
        title="طلب تمويل"
        subtitle={
          data ? `${data.applicant.name} · ${data.listing.title}` : 'بيانات شخصية — كل فتحة متسجّلة'
        }
        motif="oval"
        actions={
          <Button
            variant="white"
            size="sm"
            iconEnd={<ArrowRight />}
            onClick={() => router.push('/financing')}
          >
            كل الطلبات
          </Button>
        }
      />

      <Sheet>
        {app.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Skeleton className="h-80 w-full xl:col-span-2" />
              <Skeleton className="h-80 w-full" />
            </div>
          </div>
        ) : app.error || !data ? (
          <ErrorState message={errorMessage(app.error)} onRetry={() => app.refetch()} />
        ) : (
          <>
            <Banner
              tone="accent"
              icon={<FileClock />}
              title="الأرقام دي لقطة وقت التقديم — متحسبش القسط من جديد"
              className="mb-6"
            >
              اللقطة اتسجّلت في {formatDateTimeAr(data.quoteSnapshot.capturedAt)}. لو الشريك غيّر
              نسبه بعد كده، الطلب ده بيفضل بأرقامه — ده اللي العميل شافه واتفق عليه.
            </Banner>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* ══════════ العمود الأساسي ══════════ */}
              <div className="space-y-4 xl:col-span-2">
                {/* ───── لقطة العرض ───── */}
                <Card padded={false}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                    <div>
                      <h2 className="text-h2 text-content">لقطة العرض</h2>
                      <p className="mt-0.5 text-caption text-content-sub">
                        مصدر الحقيقة للأرقام — quote_snapshot
                      </p>
                    </div>
                    <Badge tone={data.islamic ? 'accent' : 'neutral'}>
                      {data.islamic ? 'مرابحة' : 'تمويل عادي'}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <tbody>
                        {[
                          {
                            k: 'الشريك',
                            v: PARTNER_LABELS[data.partnerSlug] ?? data.partnerSlug,
                          },
                          {
                            k: 'النسبة وقت التقديم',
                            v: formatPctPlain(data.quoteSnapshot.rate),
                          },
                          { k: 'المدة', v: `${data.quoteSnapshot.termMonths} شهر` },
                          {
                            k: 'المقدم',
                            v: `${formatPctPlain(data.quoteSnapshot.downTier, 0)} · ${formatEGP(
                              data.quoteSnapshot.downValue,
                            )}`,
                          },
                          {
                            k: 'أصل التمويل',
                            v: formatEGP(data.quoteSnapshot.principal),
                            hint: 'سعر العربية ناقص المقدم',
                          },
                          {
                            k: 'القسط الشهري',
                            v: formatEGP(data.quoteSnapshot.monthly),
                            strong: true,
                          },
                          {
                            k: 'إجمالي المدفوع',
                            v: formatEGP(data.quoteSnapshot.total),
                            hint: 'أصل التمويل + الفوايد على كل المدة',
                          },
                        ].map((row) => (
                          <tr key={row.k} className="border-b border-line last:border-0">
                            <th
                              scope="row"
                              className="w-[46%] px-5 py-3 text-start align-top text-sub font-medium text-content-sub"
                            >
                              {row.k}
                              {row.hint ? (
                                <span className="mt-0.5 block text-caption text-content-faint">
                                  {row.hint}
                                </span>
                              ) : null}
                            </th>
                            <td
                              className={cn(
                                'tnum px-5 py-3 text-end text-content',
                                row.strong ? 'text-title font-extrabold' : 'text-sub font-bold',
                              )}
                            >
                              {row.v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* ───── بيانات الفورم ───── */}
                <Card>
                  <SectionHeader
                    title="بيانات مقدّم الطلب"
                    hint="زي ما اتكتبت في فورم التقسيط جوه التطبيق"
                  />
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Facet label="الاسم بالكامل" value={data.fullName} />
                    <Facet label="الوظيفة" value={data.job} />
                    <Facet label="العنوان" value={data.address} className="sm:col-span-2" />
                    <Facet
                      label="التليفون"
                      value={maskPhone(data.applicant.phone)}
                      hint="مخفي جزئيًا — الكشف الكامل بيتم من شاشة المستخدمين وبيتسجّل"
                    />
                    <Facet label="تاريخ التقديم" value={formatDateTimeAr(data.createdAt)} />
                  </dl>
                </Card>

                {/* ───── صور البطاقة — المنطقة المحمية (§10.1) ───── */}
                <Card>
                  <SectionHeader
                    title="صور البطاقة"
                    hint="مفاتيح تخزين خاصة — بتتفتح برابط موقّع مؤقت بس"
                  />

                  <Banner
                    tone="crit"
                    icon={<ShieldAlert />}
                    title="بيانات شخصية — كل فتحة متسجّلة في سجل التدقيق"
                    className="mb-4"
                  >
                    قانون حماية البيانات المصري 151/2020 بينطبق على الداتا دي. الرابط بينتهي بعد ٥
                    دقايق، وممنوع تنزيل الصورة أو حفظها أو مشاركتها.
                  </Banner>

                  {data.idImagesDeletedAt ? (
                    <Banner tone="neutral" icon={<Trash2 />} title="الصور اتمسحت بعد قفل الطلب">
                      اتمسحت في {formatDateTimeAr(data.idImagesDeletedAt)} — ده السلوك الصح: مابنحتفظش
                      بصور البطاقة بعد ما الطلب يقفل.
                    </Banner>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <IdImageBox
                        label="وش البطاقة"
                        loading={pendingSide === 'front'}
                        disabled={signImage.isPending}
                        onOpen={() => openImage('front')}
                      />
                      <IdImageBox
                        label="ظهر البطاقة"
                        loading={pendingSide === 'back'}
                        disabled={signImage.isPending}
                        onOpen={() => openImage('back')}
                      />
                    </div>
                  )}
                </Card>
              </div>

              {/* ══════════ العمود الجانبي ══════════ */}
              <div className="space-y-4">
                {/* ───── العربية ───── */}
                <Card padded={false}>
                  <Link href={`/listings/${data.listing.id}`} className="block">
                    {data.listing.imageUrl ? (
                      /* صور محلية في public/cars — img عادي مش next/image */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={data.listing.imageUrl}
                        alt=""
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-muted-soft text-content-faint">
                        <Car className="h-8 w-8" />
                      </div>
                    )}
                    <div className="px-5 py-4">
                      <p className="text-title text-content">{data.listing.title}</p>
                      <p className="tnum mt-1 text-sub text-content-sub">
                        {data.listing.year} · {formatEGP(data.listing.price)}
                      </p>
                      <p className="mt-0.5 text-caption text-content-faint">
                        {data.listing.governorate}
                      </p>
                    </div>
                  </Link>
                </Card>

                {/* ───── الحالة والأكشنات ───── */}
                <Card>
                  <SectionHeader title="حالة الطلب" />
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_META[data.status].tone} icon={STATUS_META[data.status].icon}>
                      {STATUS_META[data.status].label}
                    </Badge>
                    {data.status === 'submitted' ? (
                      <span
                        className={cn(
                          'tnum text-sub font-bold',
                          late ? 'text-crit' : 'text-content-sub',
                        )}
                      >
                        مستني بقاله {waitingFor(data.createdAt, now)}
                      </span>
                    ) : data.reviewedAt ? (
                      <span className="text-caption text-content-faint">
                        اتراجع في {formatDateAr(data.reviewedAt)}
                      </span>
                    ) : null}
                  </div>

                  {late ? (
                    <p className="mb-4 rounded-sm bg-crit-soft px-3.5 py-2.5 text-caption font-bold text-crit">
                      عدّى الـ٢٤ ساعة اللي وعدنا العميل بيها. الأولوية للطلب ده.
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    {ACTIONS.map((a) => (
                      <Button
                        key={a.status}
                        variant={a.tone === 'crit' ? 'outline' : 'ink'}
                        size="sm"
                        disabled={data.status === a.status}
                        onClick={() => setConfirming(a.status)}
                        className={a.tone === 'crit' ? 'text-crit' : undefined}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>

                  <p className="mt-4 border-t border-line pt-3 text-caption text-content-faint">
                    كل تغيير حالة بيتسجّل بسببه في سجل التدقيق — والسجل ده مابيتمسحش.
                  </p>
                </Card>
              </div>
            </div>
          </>
        )}
      </Sheet>

      {/* ══════════ ديالوج صورة البطاقة ══════════ */}
      {viewer ? (
        <Dialog
          open
          onClose={() => setViewer(null)}
          title={viewer.side === 'front' ? 'وش البطاقة' : 'ظهر البطاقة'}
          subtitle="رابط مؤقت — بيتقفل لوحده لما الوقت يخلص"
          size="md"
        >
          <Banner
            tone="crit"
            icon={<ShieldAlert />}
            title="بيانات شخصية — كل فتحة متسجّلة في سجل التدقيق"
          >
            قانون حماية البيانات المصري 151/2020 بينطبق على الداتا دي. ممنوع التنزيل أو التصوير أو
            المشاركة.
          </Banner>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-sm border border-line bg-surface-alt px-4 py-2.5">
            <span className="text-caption text-content-sub">الرابط بينتهي بعد</span>
            <Countdown endsAt={viewer.expiresAt} size="sm" onEnd={() => setViewer(null)} />
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface-alt">
            {imageFailed ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <ImageOff className="h-6 w-6 text-content-faint" />
                <p className="text-sub text-content-sub">
                  الصورة مارجعتش من التخزين. اقفل وافتح الرابط تاني — كل محاولة بتتسجّل.
                </p>
              </div>
            ) : (
              /* الرابط الموقّع جاي من السيرفر — الواجهة عمرها ما بتبني الرابط ده */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={viewer.url}
                alt="صورة البطاقة"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onError={() => setImageFailed(true)}
                className="max-h-[46vh] w-full select-none object-contain"
              />
            )}
          </div>

          <p className="mt-3 text-caption text-content-faint">
            الصورة مش متخزّنة في المتصفح ولا في الكاش — أول ما العداد يخلص الرابط بيبطل والصورة
            بتتقفل لوحدها.
          </p>
        </Dialog>
      ) : null}

      {/* ══════════ تأكيد تغيير الحالة ══════════ */}
      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setConfirming(null)}
        onConfirm={applyStatus}
        title={action?.title ?? ''}
        impact={action?.impact ?? ''}
        confirmLabel={action?.status === 'rejected' ? 'ارفض الطلب' : 'أكّد'}
        tone={action?.tone ?? 'accent'}
        loading={setStatus.isPending}
      />
    </>
  );
}

/* ═══════════════════════ عناصر داخلية ═══════════════════════ */

function Facet({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-caption text-content-sub">{label}</dt>
      <dd className="mt-0.5 text-body font-bold text-content">{value}</dd>
      {hint ? <p className="mt-0.5 text-caption text-content-faint">{hint}</p> : null}
    </div>
  );
}

/**
 * بوكس مقفول — المفتاح عمره ما بيتحوّل لرابط هنا.
 * الضغط بيطلب رابط موقّع من السيرفر، والفتحة بتتسجّل (F-6).
 */
function IdImageBox({
  label,
  loading,
  disabled,
  onOpen,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface-alt px-4 py-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted-soft text-content-sub">
        <Lock className="h-5 w-5" />
      </span>
      <div>
        <p className="text-title text-content">{label}</p>
        <p className="mt-0.5 text-caption text-content-faint">مقفولة — محتاجة رابط موقّع</p>
      </div>
      <Button variant="outline" size="sm" loading={loading} disabled={disabled} onClick={onOpen}>
        اعرض الصورة (رابط مؤقت ٥ دقايق)
      </Button>
    </div>
  );
}
