'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Car,
  CheckCircle2,
  Eye,
  Gauge,
  Hourglass,
  MapPin,
  PackageCheck,
  ScrollText,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Countdown,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  formatKm,
  hoursSince,
  relTimeAr,
  waitingFor,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useAudit,
  useListing,
  useSellNowRequest,
  type AuditEntry,
  type ListingStatus,
  type PriceTag,
  type SellNowRequest,
  type SellNowStatus,
} from '@carq/api-client';
import {
  CarThumb,
  CollectDialog,
  OfferDialog,
  PhoneCopy,
  STATUS_META,
  StatusBadge,
  diffInk,
  diffSentence,
} from '../parts';

/**
 * ════════════════════════════════════════════════════════════════
 * `/sell-now/[id]` — الطلب الواحد (ADMIN_DASHBOARD_SPEC §4.2)
 *
 * الصفحة دي بتجاوب على سؤال واحد: **أصدر العرض بكام؟** وعشان كده
 * بتحط قدامك العربية كاملة، البائع، ومسار الطلب بالتواريخ — وسجل
 * التدقيق تحت عشان تعرف مين عمل إيه قبلك (X-6).
 * ════════════════════════════════════════════════════════════════
 */

const LISTING_STATUS: Record<ListingStatus, string> = {
  draft: 'مسودة',
  active: 'نشطة',
  reserved: 'محجوزة',
  sold: 'متباعة',
  expired: 'منتهية',
  removed: 'متشالة',
  rejected: 'مرفوضة',
};

const PRICE_TAG: Record<PriceTag, string> = {
  deal: 'لقطة',
  fair: 'سعر عادل',
  high: 'أعلى من السوق',
};

const ROLE_LABEL: Record<string, string> = {
  individual: 'بائع فرد',
  exhibition: 'معرض',
  admin: 'أدمن',
};

const AUDIT_ACTION: Record<string, string> = {
  'sell_now.offered': 'إصدار عرض',
  'sell_now.collected': 'تسجيل استلام',
  'listing.status_changed': 'تغيير حالة الإعلان',
};

const AUDIT_FIELD: Record<string, string> = {
  price: 'سعر العرض',
  suggested: 'الاقتراح',
  diff: 'الفرق',
  note: 'ملاحظة',
  listingId: 'الإعلان',
  reason: 'السبب',
  status: 'الحالة',
};

const REACHED: Record<SellNowStatus, number> = {
  pending: 0,
  offered: 1,
  declined: 1,
  expired: 1,
  cancelled: 1,
  accepted: 2,
  collected: 3,
};

export default function SellNowRequestPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const request = useSellNowRequest(id);
  const r = request.data;

  const listing = useListing(r?.listing.id ?? '');
  const l = listing.data;

  const audit = useAudit({ entityType: 'sell_now_request', entityId: id });

  const [offerOpen, setOfferOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);

  /** FND-036 — ثابتة على ساعة الموك المجمّدة عشان حساب SLA الـ٢٤ ساعة
   * ما يتأثرش بمرور وقت التشغيل الفعلي. ملفوفة بـ`useMemo` عشان مرجعها
   * يفضل ثابت بين الريندرات (`auditColumns` تحت معتمدة عليها). */
  const now = useMemo(() => new Date(nowMs()), []);
  const late = r ? r.status === 'pending' && hoursSince(r.createdAt, now) > 24 : false;

  const auditColumns: Array<Column<AuditEntry>> = useMemo(
    () => [
      {
        key: 'action',
        header: 'الأكشن',
        value: (e) => AUDIT_ACTION[e.action] ?? e.action,
        render: (e) => (
          <span className="font-bold text-content">{AUDIT_ACTION[e.action] ?? e.action}</span>
        ),
      },
      {
        key: 'actor',
        header: 'مين عمله',
        value: (e) => e.actorName,
      },
      {
        key: 'at',
        header: 'إمتى',
        value: (e) => e.createdAt,
        render: (e) => (
          <span className="text-content-sub" title={formatDateTimeAr(e.createdAt)}>
            {relTimeAr(e.createdAt, now)}
          </span>
        ),
      },
      {
        key: 'payload',
        header: 'التفاصيل',
        hideBelow: 'md',
        value: (e) => payloadText(e),
        render: (e) => <span className="text-content-sub">{payloadText(e) || '—'}</span>,
      },
    ],
    [now],
  );

  return (
    <>
      <PageHeader
        title={r ? `${r.listing.title} ${r.listing.year}` : 'طلب بيع حالًا'}
        subtitle={
          r
            ? `${STATUS_META[r.status].label} · ${STATUS_META[r.status].meaning}`
            : 'تفاصيل الطلب والقرار'
        }
        motif="underline"
        actions={
          <div className="flex items-center gap-2">
            {r?.status === 'pending' ? (
              <Button variant="white" icon={<Send />} onClick={() => setOfferOpen(true)}>
                أصدر عرض
              </Button>
            ) : null}
            {r?.status === 'accepted' ? (
              <Button variant="white" icon={<PackageCheck />} onClick={() => setCollectOpen(true)}>
                تم الاستلام
              </Button>
            ) : null}
            <Link
              href="/sell-now"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-body font-bold text-white transition-colors hover:bg-white/20"
            >
              <ArrowRight className="h-[18px] w-[18px]" />
              الطابور
            </Link>
          </div>
        }
      />

      <Sheet>
        {request.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Skeleton className="h-80 w-full xl:col-span-2" />
              <Skeleton className="h-80 w-full" />
            </div>
          </div>
        ) : request.isError ? (
          <Card>
            <ErrorState message={errorMessage(request.error)} onRetry={() => request.refetch()} />
          </Card>
        ) : !r ? (
          <Card>
            <EmptyState
              title="الطلب ده مش موجود"
              hint="يمكن يكون اتشال أو الرابط قديم. ارجع للطابور واختار طلب تاني."
              icon={<Hourglass className="h-6 w-6" />}
              action={
                <Link
                  href="/sell-now"
                  className="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-body font-bold text-content transition-colors hover:bg-surface-alt"
                >
                  ارجع للطابور
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            {r.status === 'pending' ? (
              <Banner
                tone={late ? 'crit' : 'accent'}
                icon={late ? <AlertTriangle /> : <Hourglass />}
                title={
                  late
                    ? `البائع مستني قرارك بقاله ${waitingFor(r.createdAt, now)} — عدّى الـ٢٤ ساعة`
                    : `البائع مستني قرارك بقاله ${waitingFor(r.createdAt, now)}`
                }
                action={
                  <Button
                    variant={late ? 'danger' : 'primary'}
                    size="sm"
                    icon={<Send />}
                    onClick={() => setOfferOpen(true)}
                  >
                    أصدر عرض
                  </Button>
                }
                className="mb-6"
              >
                سعر الإعلان فوق ١٫٥ مليون، فالسيرفر مابعتش عرض تلقائي واستنى قرار بشري. لحد ما
                تصدر العرض، البائع شايف «قيد المراجعة» وبس.
              </Banner>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* ═════════ العربية ═════════ */}
              <Card className="xl:col-span-2" padded={false}>
                <div className="flex flex-wrap gap-5 p-5">
                  <CarThumb url={r.listing.imageUrl} alt={r.listing.title} size={208} height={156} />
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.status} />
                      {l?.kmVerified ? (
                        <Badge tone="ok" icon={<ShieldCheck />}>
                          ممشى موثّق
                        </Badge>
                      ) : null}
                      {l?.inspected ? (
                        <Badge tone="ok" icon={<ShieldCheck />}>
                          مفحوصة
                        </Badge>
                      ) : null}
                      {l?.priceTag ? (
                        <Badge tone="neutral" icon={<Car />}>
                          {PRICE_TAG[l.priceTag]}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" icon={<Car />}>
                          مش متسعّر
                        </Badge>
                      )}
                    </div>

                    <h2 className="mt-3 text-h2 text-content">
                      {r.listing.title} {r.listing.year}
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sub text-content-sub">
                      <span className="inline-flex items-center gap-1.5">
                        <Gauge className="h-4 w-4" />
                        {formatKm(r.listing.km)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {r.listing.governorate}
                        {l?.area ? ` · ${l.area}` : ''}
                      </span>
                      {l ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Eye className="h-4 w-4" />
                          {withThousands(l.viewsCount)} مشاهدة
                        </span>
                      ) : null}
                      {l ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Camera className="h-4 w-4" />
                          {withThousands(l.photosCount)} صورة
                        </span>
                      ) : null}
                    </p>

                    <Link
                      href={`/listings/${r.listing.id}`}
                      className="mt-3 inline-flex text-sub font-bold text-accent hover:underline"
                    >
                      افتح صفحة الإعلان
                    </Link>
                  </div>
                </div>

                {/* المواصفات الكاملة */}
                <div className="border-t border-line px-5 py-4">
                  {listing.isLoading ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : listing.isError ? (
                    <ErrorState
                      message={errorMessage(listing.error)}
                      onRetry={() => listing.refetch()}
                    />
                  ) : !l ? (
                    <EmptyState
                      title="مواصفات الإعلان مش متاحة"
                      hint="الطلب موجود بس الإعلان نفسه مش راجع من السيرفر."
                      icon={<Car className="h-6 w-6" />}
                    />
                  ) : (
                    <>
                      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-4">
                        <Spec label="الماركة والموديل" value={`${l.make} ${l.model}`} />
                        <Spec label="سنة الصنع" value={String(l.year)} />
                        <Spec label="ناقل الحركة" value={l.transmission} />
                        <Spec label="نوع الجسم" value={l.body} />
                        <Spec label="اللون" value={l.color} />
                        <Spec label="العداد" value={formatKm(l.km)} />
                        <Spec label="حالة الإعلان" value={LISTING_STATUS[l.status]} />
                        <Spec
                          label="متوسط السوق"
                          value={l.marketAvg === null ? 'مش متسعّر' : formatEGP(l.marketAvg)}
                        />
                        <Spec
                          label="اتنشر"
                          value={l.publishedAt ? formatDateAr(l.publishedAt) : 'لسه مانتشرش'}
                        />
                        <Spec
                          label="بينتهي"
                          value={l.expiresAt ? formatDateAr(l.expiresAt) : '—'}
                        />
                      </dl>
                      {l.description ? (
                        <p className="mt-4 border-t border-line pt-3 text-sub text-content-sub">
                          {l.description}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>

              {/* ═════════ الاقتراح والعرض + البائع ═════════ */}
              <div className="space-y-4">
                <Card>
                  <p className="text-caption font-bold text-content-sub">سعر الإعلان</p>
                  <p className="tnum text-title text-content">{formatEGP(r.listing.price)}</p>

                  <div className="mt-4 rounded-md bg-accent-soft px-4 py-3">
                    <p className="text-caption font-bold text-accent">الاقتراح ٩١٪</p>
                    <p className="tnum text-h1 text-accent">{formatEGP(r.suggestedPrice)}</p>
                    <p className="mt-1 text-caption text-content-sub">
                      محسوب في السيرفر: ٩١٪ من سعر الإعلان مقرّبة لأقرب ألف.
                    </p>
                  </div>

                  <div className="mt-4">
                    <p className="text-caption font-bold text-content-sub">العرض المصدَّر</p>
                    {r.offerPrice === null ? (
                      <p className="text-title text-content-faint">لسه مافيش عرض</p>
                    ) : (
                      <>
                        <p className="tnum text-h2 text-content">{formatEGP(r.offerPrice)}</p>
                        <p
                          className="tnum mt-0.5 text-sub font-bold"
                          style={
                            r.offerPrice === r.suggestedPrice
                              ? undefined
                              : { color: diffInk(r.offerPrice - r.suggestedPrice) }
                          }
                        >
                          {diffSentence(r.offerPrice, r.suggestedPrice)}
                        </p>
                      </>
                    )}
                  </div>

                  {r.status === 'offered' && r.expiresAt ? (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
                      <span className="text-sub text-content-sub">الباقي على انتهاء العرض</span>
                      <Countdown endsAt={r.expiresAt} size="md" urgentBelow={3600} />
                    </div>
                  ) : null}

                  {r.status === 'pending' ? (
                    <Button
                      className="mt-4 w-full"
                      icon={<Send />}
                      onClick={() => setOfferOpen(true)}
                    >
                      أصدر عرض
                    </Button>
                  ) : null}

                  {r.status === 'accepted' ? (
                    <>
                      <Button
                        variant="ink"
                        className="mt-4 w-full"
                        icon={<PackageCheck />}
                        onClick={() => setCollectOpen(true)}
                      >
                        تم الاستلام
                      </Button>
                      <p className="mt-2 text-caption text-content-sub">
                        دلوقتي العربية محجوزة بس. الاستلام هو اللي بيخلّي الإعلان «متباعة» —
                        متضغطش غير لما تستلمها فعلًا.
                      </p>
                    </>
                  ) : null}
                </Card>

                <Card>
                  <p className="text-caption font-bold text-content-sub">البائع</p>
                  <p className="mt-1 text-title text-content">{r.seller.name}</p>
                  <p className="text-caption text-content-sub">
                    {ROLE_LABEL[r.seller.role] ?? r.seller.role}
                  </p>
                  <div className="mt-2">
                    <PhoneCopy phone={r.seller.phone} userId={r.seller.id} />
                  </div>
                  <p className="mt-3 border-t border-line pt-3 text-caption text-content-faint">
                    الرقم مخفي جزئيًا في الواجهة، وبيتنسخ كامل بضغطة.
                  </p>
                </Card>
              </div>
            </div>

            {/* ═════════ مسار الطلب ═════════ */}
            <SectionHeader
              title="مسار الطلب"
              hint="من أول ما البائع طلب لحد ما العربية اتستلمت"
              className="mt-10"
            />
            <Card>
              <Timeline request={r} />
            </Card>

            {/* ═════════ سجل التدقيق ═════════ */}
            <SectionHeader
              title="سجل التدقيق للطلب ده"
              hint="append-only — عمره ما بيتمسح"
              className="mt-10"
              action={
                <Link
                  href="/audit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sub font-bold text-content transition-colors hover:bg-surface-alt"
                >
                  <ScrollText className="h-4 w-4" />
                  السجل الكامل
                </Link>
              }
            />
            <DataTable
              caption="جدول سجل تدقيق الطلب"
              rows={audit.data?.items ?? []}
              columns={auditColumns}
              rowKey={(e) => e.id}
              loading={audit.isLoading}
              error={audit.isError ? errorMessage(audit.error) : undefined}
              onRetry={() => audit.refetch()}
              emptyTitle="مفيش أكشنات متسجّلة على الطلب ده"
              emptyHint="أول ما تصدر عرض أو تسجّل استلام، الحركة هتتسجّل هنا باسمك ووقتها."
              exportName={`audit-${id}`}
            />
          </>
        )}
      </Sheet>

      <OfferDialog request={r ?? null} open={offerOpen} onClose={() => setOfferOpen(false)} />
      <CollectDialog request={r ?? null} open={collectOpen} onClose={() => setCollectOpen(false)} />
    </>
  );
}

/* ═══════════════════════ قطع الصفحة ═══════════════════════ */

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-content-sub">{label}</dt>
      <dd className="truncate text-sub font-bold text-content">{value}</dd>
    </div>
  );
}

function payloadText(e: AuditEntry): string {
  return Object.entries(e.payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const label = AUDIT_FIELD[k] ?? k;
      const value = typeof v === 'number' ? withThousands(v) : String(v);
      return `${label}: ${value}`;
    })
    .join(' · ');
}

/**
 * مسار الحالة بالتواريخ. ملاحظة صادقة: الطلب مافيهوش `acceptedAt` —
 * فخطوة القبول بتتعلّم إنها حصلت من غير وقت، مش بتتخمّن بتاريخ تاني.
 */
function Timeline({ request }: { request: SellNowRequest }) {
  const reached = REACHED[request.status];
  const closed =
    request.status === 'declined' || request.status === 'expired' || request.status === 'cancelled';

  const steps = [
    {
      key: 'requested',
      label: 'البائع طلب بيع حالًا',
      at: request.createdAt,
      done: true,
      note: `السيرفر حسب الاقتراح على طول: ${formatEGP(request.suggestedPrice)}`,
    },
    {
      key: 'offered',
      label: 'العرض اتصدر',
      at: request.offeredAt,
      // «ملغي» ممكن يحصل قبل أي عرض — فالخطوة دي بتتعلّم بالعرض نفسه
      done: request.offeredAt !== null || request.offerPrice !== null || reached >= 2,
      note:
        request.offerPrice !== null
          ? `${formatEGP(request.offerPrice)} · ${diffSentence(request.offerPrice, request.suggestedPrice)}`
          : 'لسه مستني قرارك — فوق ١٫٥ مليون فمفيش عرض تلقائي',
    },
    {
      key: 'accepted',
      label: 'البائع قبل العرض',
      at: null,
      done: reached >= 2,
      note:
        reached >= 2
          ? 'العربية اتحجزت — مش متباعة لسه (SN-7)'
          : 'صلاحية العرض ٢٤ ساعة من وقت إصداره',
    },
    {
      key: 'collected',
      label: 'العربية اتستلمت',
      at: request.collectedAt,
      done: request.status === 'collected',
      note:
        request.status === 'collected'
          ? 'الإعلان بقى «متباعة»'
          : 'دي الخطوة اللي بتخلّي الإعلان «متباعة»',
    },
  ];

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                s.done ? 'border-ok bg-ok text-white' : 'border-line bg-surface text-content-faint'
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Hourglass className="h-3.5 w-3.5" />
              )}
            </span>
            {i < steps.length - 1 ? (
              <span
                className={`my-1 w-0.5 flex-1 rounded-full ${
                  steps[i + 1]!.done ? 'bg-ok' : 'bg-line'
                }`}
              />
            ) : null}
          </div>
          <div className={i < steps.length - 1 ? 'pb-6' : ''}>
            <p
              className={`text-title ${s.done ? 'text-content' : 'text-content-faint'}`}
            >
              {s.label}
            </p>
            <p className="text-caption text-content-sub">
              {s.at
                ? formatDateTimeAr(s.at)
                : s.done
                  ? 'حصلت — من غير وقت متسجّل في الطلب'
                  : 'لسه ماحصلتش'}
            </p>
            <p className="mt-0.5 text-sub text-content-sub">{s.note}</p>
          </div>
        </li>
      ))}

      {closed ? (
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-content-sub [&>svg]:h-4 [&>svg]:w-4">
            {STATUS_META[request.status].icon}
          </span>
          <div>
            <p className="text-title text-content">{STATUS_META[request.status].label}</p>
            <p className="mt-0.5 text-sub text-content-sub">
              {STATUS_META[request.status].meaning}
            </p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}
