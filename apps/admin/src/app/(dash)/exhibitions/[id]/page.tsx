'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  Car,
  ChevronRight,
  ClipboardList,
  FileText,
  Gavel,
  Handshake,
  Lock,
  Phone,
  ScrollText,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  formatKm,
  maskPhone,
  relTimeAr,
  secondsUntil,
  useToast,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useAudit,
  useAuctionEntries,
  useAuctions,
  useExhibition,
  useExhibitionBids,
  useListings,
  useRevealPhone,
  useSetContract,
  useUsers,
  type AuctionBid,
  type AuditEntry,
  type Listing,
} from '@carq/api-client';
import { ConditionMarks, bidBlockCode, type BidConditions } from '../_lib/conditions';

/**
 * ════════════════════════════════════════════════════════════════
 * `/exhibitions/[id]` — ملف المعرض (ADMIN_DASHBOARD_SPEC §4.4)
 *
 * الصفحة دي بتجاوب على سؤال واحد: **المعرض ده يقدر يزايد ولا لأ،
 * وليه؟** وبعدين بتدي السياق اللي بيخلي القرار مبني على حاجة:
 * الأوراق، مدة العقد، إعلاناته، مزايداته، وكل قرار اتاخد عليه قبل كده.
 * ════════════════════════════════════════════════════════════════
 */

const LISTING_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' }> = {
  draft: { label: 'مسودة', tone: 'warn' },
  active: { label: 'نشط', tone: 'ok' },
  reserved: { label: 'محجوز', tone: 'warn' },
  sold: { label: 'متباع', tone: 'neutral' },
  expired: { label: 'منتهي', tone: 'neutral' },
  removed: { label: 'متشال', tone: 'neutral' },
  rejected: { label: 'مرفوض', tone: 'crit' },
};

const AUCTION_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' }> = {
  live: { label: 'شغال', tone: 'ok' },
  settled: { label: 'اتقفل', tone: 'neutral' },
  failed: { label: 'فشل', tone: 'warn' },
  defaulted: { label: 'متعثر', tone: 'crit' },
};

const AUDIT_LABELS: Record<string, string> = {
  'exhibition.contract_changed': 'تغيير التعاقد',
  'exhibition.application_approved': 'موافقة على طلب ترقية',
  'exhibition.application_rejected': 'رفض طلب ترقية',
  'user.role_changed': 'تغيير الدور',
  'user.status_changed': 'تغيير حالة المستخدم',
  'auction_entry.paid': 'تأكيد رسوم دخول',
  'auction.defaulted': 'تعليم مزاد متعثر',
};

/** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
const daysLeft = (endsAt: string) => Math.floor(secondsUntil(endsAt, new Date(nowMs())) / 86_400);

/** صف بيانات: عنوان صغير وقيمة تحته — الشكل المتكرر في بطاقة الملف */
function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <p className="text-caption text-content-sub">{label}</p>
      <p className="mt-0.5 text-body text-content">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-content-faint">{hint}</p> : null}
    </div>
  );
}

export default function ExhibitionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const toast = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());

  const exhibition = useExhibition(id);
  const ex = exhibition.data;

  const exhibitionUsers = useUsers({ role: 'exhibition' });
  const entries = useAuctionEntries();
  const liveAuctions = useAuctions('live');
  const allAuctions = useAuctions('all');
  const bids = useExhibitionBids(id);
  const audit = useAudit({ entityType: 'exhibition', entityId: id });
  // مافيش sellerId؟ يبقى مانجيبش إعلانات حد تاني بالغلط
  const listings = useListings({ sellerId: ex?.userId ?? 'pending', status: 'all' });

  const setContract = useSetContract();
  const revealPhone = useRevealPhone();

  const liveIds = useMemo(
    () => new Set((liveAuctions.data?.items ?? []).map((a) => a.id)),
    [liveAuctions.data],
  );

  const myEntries = useMemo(
    () => (entries.data ?? []).filter((e) => e.exhibitionId === id),
    [entries.data, id],
  );

  const paidInLive = useMemo(() => {
    const live = myEntries.filter((e) => liveIds.has(e.auctionId));
    if (live.length === 0) return null;
    return live.some((e) => e.paidAt !== null);
  }, [myEntries, liveIds]);

  const conditions: BidConditions = {
    role: exhibitionUsers.isLoading
      ? null
      : (exhibitionUsers.data?.items ?? []).some((u) => u.id === ex?.userId),
    contracted: ex?.isContracted ?? false,
    entryPaid: paidInLive,
  };
  const blockCode = bidBlockCode(conditions);

  const auctionById = useMemo(() => {
    const map = new Map<string, { title: string; status: string }>();
    for (const a of allAuctions.data?.items ?? []) {
      map.set(a.id, { title: a.listing.title, status: a.status });
    }
    return map;
  }, [allAuctions.data]);

  const left = ex?.contractEndsAt ? daysLeft(ex.contractEndsAt) : null;

  const listingColumns: Array<Column<Listing>> = [
    {
      key: 'title',
      header: 'العربية',
      value: (l) => `${l.title} ${l.year}`,
      render: (l) => (
        <div className="flex min-w-[200px] items-center gap-3">
          {l.imageUrl ? (
            <img
              src={l.imageUrl}
              alt=""
              className="h-11 w-16 shrink-0 rounded-xs object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
              <Car className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-content">{l.title}</p>
            <p className="tnum mt-0.5 text-caption text-content-sub">
              {l.year} · {formatKm(l.km)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'السعر',
      sortable: true,
      value: (l) => l.price,
      render: (l) => <span className="tnum whitespace-nowrap">{formatEGP(l.price)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      value: (l) => LISTING_STATUS[l.status]?.label ?? l.status,
      render: (l) => (
        <Badge tone={LISTING_STATUS[l.status]?.tone ?? 'neutral'} icon={<Car />}>
          {LISTING_STATUS[l.status]?.label ?? l.status}
        </Badge>
      ),
    },
    {
      key: 'publishedAt',
      header: 'النشر',
      hideBelow: 'md',
      value: (l) => l.publishedAt ?? '',
      render: (l) => (
        <span className="whitespace-nowrap text-content-sub">
          {l.publishedAt ? relTimeAr(l.publishedAt, now) : 'مانشرش لسه'}
        </span>
      ),
    },
  ];

  const bidColumns: Array<Column<AuctionBid>> = [
    {
      key: 'auction',
      header: 'العربية',
      value: (b) => auctionById.get(b.auctionId)?.title ?? b.auctionId,
      render: (b) => (
        <Link
          href={`/auctions/${b.auctionId}`}
          className="font-bold text-content hover:text-accent"
          onClick={(ev) => ev.stopPropagation()}
        >
          {auctionById.get(b.auctionId)?.title ?? b.auctionId}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'المزايدة',
      sortable: true,
      value: (b) => b.amount,
      render: (b) => <span className="tnum whitespace-nowrap">{formatEGP(b.amount)}</span>,
    },
    {
      key: 'status',
      header: 'حالة المزاد',
      align: 'center',
      value: (b) => AUCTION_STATUS[auctionById.get(b.auctionId)?.status ?? '']?.label ?? '—',
      render: (b) => {
        const s = auctionById.get(b.auctionId)?.status;
        if (!s) return <span className="text-content-faint">—</span>;
        return (
          <Badge tone={AUCTION_STATUS[s]?.tone ?? 'neutral'} icon={<Gavel />}>
            {AUCTION_STATUS[s]?.label ?? s}
          </Badge>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'وقت المزايدة',
      hideBelow: 'md',
      value: (b) => b.createdAt,
      render: (b) => (
        <span className="whitespace-nowrap text-content-sub">{formatDateTimeAr(b.createdAt)}</span>
      ),
    },
  ];

  const auditColumns: Array<Column<AuditEntry>> = [
    {
      key: 'action',
      header: 'الإجراء',
      value: (a) => AUDIT_LABELS[a.action] ?? a.action,
      render: (a) => (
        <div className="min-w-[150px]">
          <p className="font-bold text-content">{AUDIT_LABELS[a.action] ?? a.action}</p>
          <p className="mt-0.5 text-caption text-content-faint">{a.action}</p>
        </div>
      ),
    },
    {
      key: 'actorName',
      header: 'مين عمله',
      value: (a) => a.actorName,
    },
    {
      key: 'reason',
      header: 'السبب المكتوب',
      value: (a) => String(a.payload.reason ?? ''),
      render: (a) => (
        <span className="text-content-sub">
          {a.payload.reason ? String(a.payload.reason) : 'من غير سبب مكتوب'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'الوقت',
      hideBelow: 'md',
      value: (a) => a.createdAt,
      render: (a) => (
        <span className="whitespace-nowrap text-content-sub">{formatDateTimeAr(a.createdAt)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={ex?.name ?? 'ملف المعرض'}
        subtitle={
          ex ? `${ex.ownerName} · ${ex.governorate} — ${ex.area}` : 'بيانات المعرض وحالة التعاقد'
        }
        motif="swoosh"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/exhibitions">
              <Button variant="ghost" size="sm" icon={<ChevronRight />} className="text-white/70">
                كل المعارض
              </Button>
            </Link>
            {ex ? (
              <Button
                variant={ex.isContracted ? 'danger' : 'white'}
                size="sm"
                icon={<Handshake />}
                onClick={() => setConfirmOpen(true)}
              >
                {ex.isContracted ? 'أوقف التعاقد' : 'امنح التعاقد'}
              </Button>
            ) : null}
          </div>
        }
      />

      <Sheet>
        {exhibition.isError ? (
          <ErrorState
            message={errorMessage(exhibition.error)}
            onRetry={() => void exhibition.refetch()}
          />
        ) : exhibition.isLoading || !ex ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          </div>
        ) : (
          <>
            {/* ───── هل يقدر يزايد؟ ───── */}
            <Card className={blockCode ? 'mb-6 border-warn/30' : 'mb-6 border-ok/30'}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-title text-content">
                    {blockCode ? 'المعرض ده مش قادر يزايد دلوقتي' : 'المعرض ده يقدر يزايد دلوقتي'}
                  </p>
                  <p className="mt-1 text-sub text-content-sub">
                    الشروط الثلاثة بتتحقق في السيرفر بالترتيب — وأول شرط ناقص هو اللي بيوقفه.
                  </p>
                  <div className="mt-3">
                    <ConditionMarks c={conditions} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ex.verified ? (
                    <Badge tone="ok" icon={<ShieldCheck />}>
                      موثّق
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon={<ShieldOff />}>
                      مش موثّق
                    </Badge>
                  )}
                  <Badge tone={ex.isContracted ? 'ok' : 'warn'} icon={<Handshake />}>
                    {ex.isContracted ? 'متعاقد' : 'مش متعاقد'}
                  </Badge>
                </div>
              </div>
            </Card>

            <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* ───── البيانات والأوراق ───── */}
              <Card>
                <SectionHeader
                  title="البيانات والأوراق"
                  hint="المراجع القانونية اللي المعرض اتقبل على أساسها"
                />
                <Row label="اسم المعرض" value={ex.name} />
                <Row label="اسم المالك" value={ex.ownerName} />
                <Row
                  label="تليفون المعرض"
                  value={ex.phone ? maskPhone(ex.phone) : 'مش مسجّل'}
                  hint="الرقم مخفي جزئيًا افتراضيًا (§10.2)"
                />
                <div className="border-b border-line py-2.5">
                  <p className="text-caption text-content-sub">تليفون المالك</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <p className="tnum text-body text-content">
                      {ownerPhone ?? 'الرقم مخفي'}
                    </p>
                    {ownerPhone ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Phone />}
                        loading={revealPhone.isPending}
                        onClick={() =>
                          revealPhone.mutate(
                            { userId: ex.userId },
                            {
                              onSuccess: (p) => setOwnerPhone(p),
                              onError: (err) =>
                                toast({ title: errorMessage(err), tone: 'crit' }),
                            },
                          )
                        }
                      >
                        اكشف الرقم
                      </Button>
                    )}
                  </div>
                  <p className="mt-0.5 text-caption text-content-faint">
                    الكشف أكشن واعٍ وبيتسجّل في سجل التدقيق (user.phone_revealed)
                  </p>
                </div>
                <Row label="العنوان" value={ex.address ?? 'مش مسجّل'} />
                <Row label="رقم السجل التجاري" value={ex.commercialRegister ?? 'مش مسجّل'} />
                <Row label="الرقم الضريبي" value={ex.taxId ?? 'مش مسجّل'} />
                <Row
                  label="بيقدّم فحص فني؟"
                  value={ex.inspectionService ? 'أيوه' : 'لأ'}
                  hint="بيظهر في ملف المعرض للمشترين"
                />
                <Row label="ملاحظة التمويل" value={ex.financingNote ?? 'مفيش'} />

                <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-surface-alt px-4 py-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-content-faint" />
                  <div className="min-w-0">
                    <p className="text-sub font-bold text-content">
                      صور الأوراق نفسها مش هنا — وده مقصود
                    </p>
                    <p className="mt-1 text-caption text-content-sub">
                      السجل التجاري والبطاقة الضريبية متخزنين مع طلب الترقية تحت بادئة private،
                      وبيتفتحوا برابط موقّع ٥ دقايق بس وكل فتحة متسجّلة (F-6).
                    </p>
                    <Link href="/exhibitions/requests" className="mt-2 inline-block">
                      <Button variant="outline" size="sm" icon={<ClipboardList />}>
                        افتح طلبات الترقية
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>

              {/* ───── التعاقد ومدته ───── */}
              <Card>
                <SectionHeader
                  title="حالة التعاقد ومدته"
                  hint="التعاقد هو الشرط الوحيد اللي بتتحكم فيه من هنا"
                />

                {ex.isContracted && left !== null && left <= 30 ? (
                  <Banner
                    tone={left <= 0 ? 'crit' : 'warn'}
                    icon={<AlertTriangle />}
                    title={
                      left <= 0
                        ? 'العقد خلص والمفتاح لسه مفتوح'
                        : `العقد بيخلص خلال ${withThousands(left)} يوم`
                    }
                    className="mb-4"
                  >
                    is_contracted بوليان — مابيقفلش لوحده. لازم حد يفتكر يقفله بإيده، وده بالظبط سبب
                    إن المطلوب في الباك عمود contract_ends_at مع جوب يومي بيقفل المنتهي.
                  </Banner>
                ) : null}

                <Row
                  label="حالة التعاقد"
                  value={ex.isContracted ? 'متعاقد — المزايدة مفتوحة' : 'مش متعاقد — المزايدة مقفولة'}
                />
                <Row
                  label="بداية العقد"
                  value={ex.contractStartsAt ? formatDateAr(ex.contractStartsAt) : 'مش مسجّل'}
                />
                <Row
                  label="نهاية العقد"
                  value={ex.contractEndsAt ? formatDateAr(ex.contractEndsAt) : 'مش مسجّل'}
                  hint={
                    left === null
                      ? undefined
                      : left <= 0
                        ? 'خلص خلاص'
                        : `باقي ${withThousands(left)} يوم`
                  }
                />
                <Row
                  label="رسوم دخول المزادات"
                  value={`${withThousands(myEntries.filter((e) => e.paidAt !== null).length)} مدفوعة · ${withThousands(
                    myEntries.filter((e) => e.paidAt === null).length,
                  )} مستحقة`}
                  hint="رسوم الدخول بتتدفع لكل مزاد لوحده — مش مرة واحدة للأبد"
                />
                <Row
                  label="إجمالي النشاط"
                  value={`${withThousands(ex.bidsCount)} مزايدة · ${withThousands(ex.winsCount)} مكسب`}
                  hint={ex.lastActiveAt ? `آخر نشاط ${relTimeAr(ex.lastActiveAt, now)}` : undefined}
                />

                <div className="mt-4">
                  <Button
                    variant={ex.isContracted ? 'danger' : 'primary'}
                    icon={<Handshake />}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {ex.isContracted ? 'أوقف التعاقد' : 'امنح التعاقد'}
                  </Button>
                  <p className="mt-2 text-caption text-content-faint">
                    القرار ده محتاج سبب مكتوب، وبيتسجّل في سجل التدقيق باسمك.
                  </p>
                </div>
              </Card>
            </div>

            {/* ───── إعلاناته ───── */}
            <SectionHeader
              title="إعلانات المعرض"
              hint={`كل الإعلانات المربوطة بحساب المعرض — ${withThousands(
                listings.data?.total ?? 0,
              )} إعلان`}
              action={
                <Link href={`/listings?sellerId=${ex.userId}`}>
                  <Button variant="outline" size="sm" icon={<Car />}>
                    افتحهم في الإعلانات
                  </Button>
                </Link>
              }
            />
            <DataTable<Listing>
              caption="جدول إعلانات المعرض"
              rows={listings.data?.items ?? []}
              columns={listingColumns}
              rowKey={(l) => l.id}
              loading={listings.isLoading}
              error={listings.isError ? errorMessage(listings.error) : undefined}
              onRetry={() => void listings.refetch()}
              emptyTitle="المعرض ده مانشرش أي إعلان"
              emptyHint="المعرض لسه مارفعش عربيات — أو الإعلانات كلها لسه مسودات من غير صور."
              exportName={`exhibition-${ex.id}-listings`}
              className="mb-8"
            />

            {/* ───── مزايداته ───── */}
            <SectionHeader
              title="مزايدات المعرض"
              hint="كل مزايدة اتسجّلت باسم المعرض — المزايدات مابتتمسحش أبدًا (X-6)"
            />
            <DataTable<AuctionBid>
              caption="جدول مزايدات المعرض"
              rows={bids.data ?? []}
              columns={bidColumns}
              rowKey={(b) => b.id}
              loading={bids.isLoading || allAuctions.isLoading}
              error={bids.isError ? errorMessage(bids.error) : undefined}
              onRetry={() => void bids.refetch()}
              emptyTitle="مفيش مزايدات للمعرض ده"
              emptyHint={
                blockCode
                  ? 'منطقي — الشروط الثلاثة لسه مش كاملة، فالمزايدة مقفولة عليه أصلًا.'
                  : 'الشروط كاملة بس لسه مادخلش أي مزاد.'
              }
              exportName={`exhibition-${ex.id}-bids`}
              className="mb-8"
            />

            {/* ───── سجل التدقيق ───── */}
            <SectionHeader
              title="سجل التدقيق"
              hint="كل قرار اتاخد على المعرض ده — append-only، ومابيتمسحش (X-6)"
              action={
                <Link href={`/audit?entityId=${ex.id}`}>
                  <Button variant="outline" size="sm" icon={<ScrollText />}>
                    السجل الكامل
                  </Button>
                </Link>
              }
            />
            <DataTable<AuditEntry>
              caption="جدول سجل تدقيق المعرض"
              rows={audit.data?.items ?? []}
              columns={auditColumns}
              rowKey={(a) => a.id}
              loading={audit.isLoading}
              error={audit.isError ? errorMessage(audit.error) : undefined}
              onRetry={() => void audit.refetch()}
              emptyTitle="مفيش قرارات متسجّلة على المعرض ده"
              emptyHint="أول ما تغيّر التعاقد أو الدور، القرار هيظهر هنا بسببه المكتوب."
              exportName={`exhibition-${ex.id}-audit`}
            />
          </>
        )}
      </Sheet>

      {/* ───── تأكيد مزدوج على التعاقد (§10.5) ───── */}
      <ConfirmDialog
        open={confirmOpen && Boolean(ex)}
        onClose={() => setConfirmOpen(false)}
        title={ex?.isContracted ? 'إيقاف تعاقد المعرض' : 'منح التعاقد للمعرض'}
        impact={
          ex?.isContracted
            ? 'ده بيسحب من المعرض حق المزايدة فورًا. أي مزاد شغال هو داخل فيه مش هيقدر يكمّل فيه، ورسوم الدخول اللي دفعها متبقاش نافعة.'
            : 'ده بيدي المعرض حق المزايدة بفلوس. متأكد؟'
        }
        confirmLabel={ex?.isContracted ? 'أوقف التعاقد' : 'امنح التعاقد'}
        tone={ex?.isContracted ? 'crit' : 'accent'}
        // منح التعاقد بيفتح مسار مالي حقيقي (المزايدة بفلوس) — نفس
        // مستوى تشدد ترقية الدور وتعليم المزاد المتعثر (FND-020).
        // إيقاف التعاقد عكسي وأقل خطورة من فتح تدفق جديد، فمابنطلبوش.
        typeToConfirm={ex?.isContracted ? undefined : 'تعاقد'}
        requireReason
        reasonLabel="سبب القرار"
        reasonHint="بيتسجّل في سجل التدقيق (exhibition.contract_changed) ومابيتمسحش"
        loading={setContract.isPending}
        onConfirm={(reason) => {
          if (!ex) return;
          const next = !ex.isContracted;
          setContract.mutate(
            { id: ex.id, isContracted: next, reason },
            {
              onSuccess: () => {
                toast({
                  title: next ? 'المعرض بقى متعاقد' : 'التعاقد اتوقف',
                  body: next
                    ? 'فاضل يدفع رسوم دخول المزاد عشان يقدر يزايد فيه.'
                    : 'المعرض فاضل معرض — بس مابيزايدش.',
                  tone: next ? 'ok' : 'info',
                });
                setConfirmOpen(false);
              },
              onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
            },
          );
        }}
      >
        {ex ? (
          <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
            <p className="text-sub font-bold text-content">{ex.name}</p>
            <p className="mt-1 text-caption text-content-sub">
              {ex.ownerName} · {ex.governorate} — {ex.area}
            </p>
            <p className="mt-1 text-caption text-content-sub">
              السجل التجاري: {ex.commercialRegister ?? 'مش مسجّل'} · الرقم الضريبي:{' '}
              {ex.taxId ?? 'مش مسجّل'}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-caption text-content-faint">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              التعاقد شرط واحد من ثلاثة — الدور ورسوم دخول المزاد قرارات منفصلة عنه.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
