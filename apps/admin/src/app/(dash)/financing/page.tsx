'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Car, CheckCircle2, FileClock, Inbox, PhoneCall, XCircle } from 'lucide-react';
import {
  Badge,
  Banner,
  ChartFrame,
  DataTable,
  Funnel,
  PageHeader,
  SectionHeader,
  Sheet,
  Tabs,
  VerticalBars,
  cn,
  formatDateAr,
  formatEGP,
  formatPctPlain,
  hoursSince,
  maskPhone,
  seriesColor,
  waitingFor,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useBreakdown,
  useFinancingApps,
  useFunnel,
  type FinancingApplication,
  type FinancingStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/financing` — طلبات التمويل (ADMIN_DASHBOARD_SPEC §4.6)
 *
 * قاعدتين بيحكموا الشاشة دي:
 *
 *  · **F-4 — `quote_snapshot` هو مصدر الحقيقة.** الأرقام المعروضة
 *    (النسبة وأصل التمويل والقسط والإجمالي) اتسجّلت **وقت التقديم**.
 *    لو جميل غيّرت نسبها بعد كده، الطلب القديم بيفضل بأرقامه.
 *    ممنوع نعيد حساب القسط في الفرونت — ده الرقم اللي العميل شافه.
 *
 *  · **SLA ٢٤ ساعة معروض للعميل.** فعمود «مستني بقاله» بيبقى أحمر
 *    بعد ٢٤ ساعة، والصف كله بياخد لون تنبيه — زي طابور بيع حالًا.
 * ════════════════════════════════════════════════════════════════
 */

/** الوعد المعروض للعميل: تواصل خلال ٢٤ ساعة */
const SLA_HOURS = 24;

const STATUS_META: Record<FinancingStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  submitted: { label: 'جديد', tone: 'accent', icon: <Inbox /> },
  contacted: { label: 'اتواصلنا', tone: 'neutral', icon: <PhoneCall /> },
  approved: { label: 'متوافق عليه', tone: 'ok', icon: <CheckCircle2 /> },
  rejected: { label: 'مرفوض', tone: 'crit', icon: <XCircle /> },
};

const PARTNER_LABELS: Record<string, string> = { jameel: 'جميل' };

const DOWN_LABELS: Record<string, string> = {
  '0': 'من غير مقدم',
  '30': 'مقدم 30٪',
  '50': 'مقدم 50٪',
};

type TabKey = FinancingStatus | 'all';

const TABS: TabDef[] = [
  { key: 'submitted', label: 'جديدة' },
  { key: 'contacted', label: 'اتواصلنا' },
  { key: 'approved', label: 'متوافق عليها' },
  { key: 'rejected', label: 'مرفوضة' },
  { key: 'all', label: 'الكل' },
];

export default function FinancingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('submitted');
  const [cursor, setCursor] = useState<string | null>(null);
  const [seen, setSeen] = useState<Array<string | null>>([]);

  const apps = useFinancingApps(tab, cursor);
  const funnel = useFunnel('financing');
  const terms = useBreakdown('term_months');
  const tiers = useBreakdown('down_tier');

  const rows = apps.data?.items ?? [];

  const goTab = (key: string) => {
    setTab(key as TabKey);
    setCursor(null);
    setSeen([]);
  };

  const lateCount = rows.filter(
    (r) => r.status === 'submitted' && hoursSince(r.createdAt) >= SLA_HOURS,
  ).length;

  const columns: Array<Column<FinancingApplication>> = [
    {
      key: 'applicant',
      header: 'مقدّم الطلب',
      sortable: true,
      value: (r) => r.applicant.name,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-content">{r.applicant.name}</p>
          <p className="tnum text-caption text-content-faint">{maskPhone(r.applicant.phone)}</p>
        </div>
      ),
    },
    {
      key: 'listing',
      header: 'العربية',
      value: (r) => r.listing.title,
      render: (r) => (
        <Link
          href={`/listings/${r.listing.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-3 transition-colors hover:text-accent"
        >
          {r.listing.imageUrl ? (
            /* صور محلية في public/cars — img عادي مش next/image */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={r.listing.imageUrl}
              alt=""
              className="h-10 w-14 shrink-0 rounded-xs object-cover"
            />
          ) : (
            <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
              <Car className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block max-w-[170px] truncate font-bold">{r.listing.title}</span>
            <span className="tnum block text-caption text-content-faint">
              {r.listing.year} · {formatEGP(r.listing.price)}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: 'partner',
      header: 'الشريك',
      hideBelow: 'xl',
      value: (r) => PARTNER_LABELS[r.partnerSlug] ?? r.partnerSlug,
      render: (r) => (
        <span className="text-content-sub">{PARTNER_LABELS[r.partnerSlug] ?? r.partnerSlug}</span>
      ),
    },
    {
      key: 'down',
      header: 'المقدم',
      align: 'center',
      sortable: true,
      value: (r) => r.downTier,
      render: (r) => (
        <div>
          <p className="tnum font-bold text-content">{formatPctPlain(r.downTier, 0)}</p>
          <p className="tnum text-caption text-content-faint">
            {formatEGP(r.quoteSnapshot.downValue)}
          </p>
        </div>
      ),
    },
    {
      key: 'term',
      header: 'المدة',
      align: 'center',
      sortable: true,
      hideBelow: 'md',
      value: (r) => r.termMonths,
      render: (r) => <span className="tnum">{r.termMonths} شهر</span>,
    },
    {
      key: 'islamic',
      header: 'نوع التمويل',
      hideBelow: 'lg',
      value: (r) => (r.islamic ? 'مرابحة' : 'عادي'),
      render: (r) => (
        <Badge tone={r.islamic ? 'accent' : 'neutral'}>{r.islamic ? 'مرابحة' : 'عادي'}</Badge>
      ),
    },
    {
      key: 'monthly',
      header: 'القسط الشهري',
      align: 'end',
      sortable: true,
      value: (r) => r.quoteSnapshot.monthly,
      render: (r) => (
        <div>
          <p className="tnum font-extrabold text-content">{formatEGP(r.quoteSnapshot.monthly)}</p>
          <p className="tnum text-caption text-content-faint">
            نسبة {formatPctPlain(r.quoteSnapshot.rate)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      value: (r) => STATUS_META[r.status].label,
      render: (r) => (
        <Badge tone={STATUS_META[r.status].tone} icon={STATUS_META[r.status].icon}>
          {STATUS_META[r.status].label}
        </Badge>
      ),
    },
    {
      key: 'waiting',
      header: 'مستني بقاله',
      align: 'center',
      sortable: true,
      value: (r) => (r.status === 'submitted' ? Math.round(hoursSince(r.createdAt)) : 0),
      render: (r) => {
        if (r.status === 'submitted') {
          const late = hoursSince(r.createdAt) >= SLA_HOURS;
          return (
            <span
              className={cn('tnum font-extrabold', late ? 'text-crit' : 'text-content-sub')}
              title={late ? 'عدّى الـ٢٤ ساعة اللي وعدنا العميل بيها' : undefined}
            >
              {waitingFor(r.createdAt)}
            </span>
          );
        }
        if (r.reviewedAt) {
          return (
            <span className="text-caption text-content-faint">
              رد بعد {waitingFor(r.createdAt, new Date(r.reviewedAt))}
            </span>
          );
        }
        return <span className="text-content-faint">—</span>;
      },
    },
    {
      key: 'createdAt',
      header: 'تاريخ التقديم',
      sortable: true,
      hideBelow: 'lg',
      value: (r) => r.createdAt,
      render: (r) => <span className="text-content-sub">{formatDateAr(r.createdAt)}</span>,
    },
  ];

  /* ───────── التشارتس ───────── */

  const funnelSteps = funnel.data?.steps ?? [];

  const termRows = useMemo(
    () =>
      [...(terms.data ?? [])]
        .sort((a, b) => Number(a.key) - Number(b.key))
        .map((b) => ({ label: `${b.key} شهر`, count: b.count })),
    [terms.data],
  );

  const tierRows = useMemo(
    () =>
      [...(tiers.data ?? [])]
        .sort((a, b) => Number(a.key) - Number(b.key))
        .map((b) => ({ label: DOWN_LABELS[b.key] ?? `${b.key}٪`, count: b.count })),
    [tiers.data],
  );

  return (
    <>
      <PageHeader
        title="طلبات التمويل"
        subtitle="وعدنا العميل نتواصل خلال ٢٤ ساعة — اللي بيعدّي المدة دي بيتعلّم أحمر"
        motif="underline"
        actions={
          lateCount > 0 ? (
            <span className="tnum rounded-full bg-crit px-3.5 py-1.5 text-sub font-bold text-white">
              {withThousands(lateCount)} عدّى الـ٢٤ ساعة
            </span>
          ) : null
        }
      >
        <Tabs tabs={TABS} value={tab} onChange={goTab} onDark />
      </PageHeader>

      <Sheet>
        {/* ───── F-4: الأرقام لقطة وقت التقديم، مش حساب جديد ───── */}
        <Banner
          tone="accent"
          icon={<FileClock />}
          title="كل الأرقام هنا لقطة وقت التقديم — مش محسوبة دلوقتي"
          className="mb-6"
        >
          القسط والإجمالي وأصل التمويل والنسبة كلهم متسجّلين في quote_snapshot ساعة ما العميل قدّم
          الطلب. لو جميل غيّرت نسبها بعد كده، الطلب القديم بيفضل بأرقامه القديمة — ده الرقم اللي
          العميل شافه واتفق عليه.
        </Banner>

        <SectionHeader
          title="الطلبات"
          hint="اضغط على أي صف تفتح تفاصيل الطلب وصور البطاقة المحمية"
        />

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={apps.isLoading}
          error={apps.error ? errorMessage(apps.error) : undefined}
          onRetry={() => apps.refetch()}
          emptyTitle="مفيش طلبات في التبويب ده"
          emptyHint="أول ما عميل يقدّم طلب تمويل من التطبيق هيظهر هنا على طول."
          onRowClick={(r) => router.push(`/financing/${r.id}`)}
          rowTone={(r) =>
            r.status === 'submitted' && hoursSince(r.createdAt) >= SLA_HOURS ? 'crit' : undefined
          }
          searchable
          searchPlaceholder="دوّر باسم مقدّم الطلب أو العربية…"
          exportName="financing"
          hasMore={Boolean(apps.data?.nextCursor)}
          canPrev={seen.length > 0}
          onNext={() => {
            setSeen((s) => [...s, cursor]);
            setCursor(apps.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            setCursor(seen[seen.length - 1] ?? null);
            setSeen((s) => s.slice(0, -1));
          }}
          pageInfo={
            apps.data
              ? `${withThousands(rows.length)} من ${withThousands(apps.data.total ?? rows.length)} طلب`
              : undefined
          }
        />

        {/* ───── التشارتس C-30 · C-31 · C-32 ───── */}
        <SectionHeader
          title="شكل الطلبات"
          hint="الأرقام دي من لقطات العروض المسجّلة — مش من نسب جميل الحالية"
          className="mb-4 mt-9"
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartFrame
            code="C-30"
            title="قمع طلبات التمويل"
            hint="بيوري فين الطلبات بتقف بالظبط"
            height={280}
            loading={funnel.isLoading}
            error={funnel.error ? errorMessage(funnel.error) : undefined}
            isEmpty={!funnel.isLoading && funnelSteps.length === 0}
            tableColumns={[
              { key: 'label', label: 'الخطوة' },
              { key: 'count', label: 'طلبات' },
            ]}
            tableRows={funnelSteps.map((s) => ({ label: s.label, count: s.count }))}
          >
            <Funnel
              steps={funnelSteps.map((s) => ({
                key: s.key,
                label: s.label,
                count: s.count,
                hint: s.key === 'contacted' ? 'هنا بيتقفل وعد الـ٢٤ ساعة' : undefined,
              }))}
            />
          </ChartFrame>

          <ChartFrame
            code="C-31"
            title="توزيع المدة"
            hint="المدة اللي العملاء بيختاروها بالشهور"
            height={280}
            loading={terms.isLoading}
            error={terms.error ? errorMessage(terms.error) : undefined}
            isEmpty={!terms.isLoading && termRows.length === 0}
            tableColumns={[
              { key: 'label', label: 'المدة' },
              { key: 'count', label: 'طلبات' },
            ]}
            tableRows={termRows}
          >
            <VerticalBars
              data={termRows}
              height={280}
              unit="طلب"
              series={[{ key: 'count', label: 'طلبات', color: seriesColor(1) }]}
            />
          </ChartFrame>

          <ChartFrame
            code="C-32"
            title="توزيع المقدم"
            hint="المقدم وقت التقديم — هو اللي بيحدد النسبة"
            height={280}
            loading={tiers.isLoading}
            error={tiers.error ? errorMessage(tiers.error) : undefined}
            isEmpty={!tiers.isLoading && tierRows.length === 0}
            tableColumns={[
              { key: 'label', label: 'المقدم' },
              { key: 'count', label: 'طلبات' },
            ]}
            tableRows={tierRows}
          >
            <VerticalBars
              data={tierRows}
              height={280}
              unit="طلب"
              series={[{ key: 'count', label: 'طلبات', color: seriesColor(2) }]}
            />
          </ChartFrame>
        </div>
      </Sheet>
    </>
  );
}
