'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Info, PackageCheck, Send } from 'lucide-react';
import {
  Banner,
  Button,
  ChartFrame,
  Countdown,
  DataTable,
  DivergingBars,
  Funnel,
  Histogram,
  PageHeader,
  SectionHeader,
  Sheet,
  Tabs,
  compactEGP,
  formatEGP,
  hoursSince,
  maskPhone,
  waitingFor,
  withThousands,
  type Column,
  type TabDef,
} from '@carq/ui';
import {
  errorMessage,
  useFunnel,
  usePendingCount,
  useSellNowQueue,
  type SellNowRequest,
} from '@carq/api-client';
import {
  CarThumb,
  CollectDialog,
  OfferDialog,
  PhoneCopy,
  StatusBadge,
  diffInk,
} from './parts';

/**
 * ════════════════════════════════════════════════════════════════
 * `/sell-now` — طابور «بيع حالًا» ★ (ADMIN_DASHBOARD_SPEC §4.2)
 *
 * **الشاشة الأهم في الداشبورد كلها.** كل صف هنا واحد مستني قرار
 * بفلوس حقيقية (`SN-2`): السيرفر بيحسب اقتراح ٩١٪، وتحت ١٫٥ مليون
 * بيصدّر العرض لوحده، وفوقها بيقف ويستنى الأونر.
 *
 * تلوين الصف الأحمر مش زينة: ده طلب عدّى ٢٤ ساعة وصاحبه لسه مستني.
 *
 * العدادات بتتجمع من **الطابور نفسه** — كل تبويب بيجيب `total` بتاعه
 * من السيرفر، فالرقم اللي على التبويب هو نفس الرقم اللي في الجدول.
 * ════════════════════════════════════════════════════════════════
 */

type TabKey = 'pending' | 'offered' | 'accepted' | 'collected' | 'closed' | 'all';

const TAB_LABELS: Array<{ key: TabKey; label: string }> = [
  { key: 'pending', label: 'مستنية قرارك' },
  { key: 'offered', label: 'عروض قايمة' },
  { key: 'accepted', label: 'مقبولة' },
  { key: 'collected', label: 'تم الاستلام' },
  { key: 'closed', label: 'مرفوضة ومنتهية' },
  { key: 'all', label: 'الكل' },
];

const EMPTY: Record<TabKey, { title: string; hint: string }> = {
  pending: {
    title: 'مفيش طلب مستني قرارك',
    hint: 'كل الطلبات اللي فوق ١٫٥ مليون اتصدرلها عروض. الطابور ده بيتحدّث كل ٢٠ ثانية.',
  },
  offered: {
    title: 'مفيش عروض قايمة',
    hint: 'العرض بيفضل قايم ٢٤ ساعة من وقت إصداره، وبعدها بيتحوّل لمنتهي.',
  },
  accepted: {
    title: 'مفيش عربيات مقبولة مستنية استلام',
    hint: 'أول ما بائع يقبل عرض، العربية بتتحجز وبتظهر هنا لحد ما تتستلم.',
  },
  collected: {
    title: 'مفيش عربيات اتستلمت',
    hint: 'الاستلام هو اللي بيخلّي الإعلان «متباعة» — قبل كده هو محجوز بس.',
  },
  closed: {
    title: 'مفيش طلبات مرفوضة ولا منتهية',
    hint: 'هنا بتتجمع الطلبات اللي البائع رفضها أو اللي عدّت عليها الـ٢٤ ساعة.',
  },
  all: {
    title: 'مفيش طلبات بيع حالًا لسه',
    hint: 'أول ما بائع يطلب بيع حالًا من التطبيق هيظهر هنا على طول.',
  },
};

/** شرايح زمن الرد (C-12) — الشكل بيكشف الذيل اللي المتوسط بيخبّيه */
const RESPONSE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: 'أقل من ساعة', max: 1 },
  { label: '1 – 3 ساعات', max: 3 },
  { label: '3 – 6 ساعات', max: 6 },
  { label: '6 – 12 ساعة', max: 12 },
  { label: '12 – 24 ساعة', max: 24 },
  { label: '24 – 48 ساعة', max: 48 },
  { label: 'أكتر من يومين', max: Infinity },
];

export default function SellNowQueuePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('pending');
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);
  const [offerFor, setOfferFor] = useState<SellNowRequest | null>(null);
  const [collectFor, setCollectFor] = useState<SellNowRequest | null>(null);

  /** الـcursor بيتبع التبويب المفتوح بس — الباقي بيفضل على أول صفحة */
  const at = (key: TabKey) => (tab === key ? cursor : null);

  const qPending = useSellNowQueue('pending', at('pending'));
  const qOffered = useSellNowQueue('offered', at('offered'));
  const qAccepted = useSellNowQueue('accepted', at('accepted'));
  const qCollected = useSellNowQueue('collected', at('collected'));
  const qClosed = useSellNowQueue('closed', at('closed'));
  const qAll = useSellNowQueue('all', at('all'));

  const pendingCount = usePendingCount();
  const funnel = useFunnel('sell_now');

  const queues = {
    pending: qPending,
    offered: qOffered,
    accepted: qAccepted,
    collected: qCollected,
    closed: qClosed,
    all: qAll,
  };

  const active = queues[tab];
  const rows = active.data?.items ?? [];

  const tabs: TabDef[] = TAB_LABELS.map((t) => ({
    key: t.key,
    label: t.label,
    count: queues[t.key].data?.total,
    alert: t.key === 'pending',
  }));

  const goTab = (key: string) => {
    setTab(key as TabKey);
    setCursor(null);
    setTrail([]);
  };

  /**
   * صفوف التشارتس: اتحاد التبويبات الخمسة (كل واحد صفحة واحدة عند
   * أحجامنا الحالية) — مش تبويب «الكل» عشان ده بيتقسّم بالـcursor.
   */
  const allRows = useMemo(() => {
    const seen = new Map<string, SellNowRequest>();
    [qPending, qOffered, qAccepted, qCollected, qClosed].forEach((q) =>
      (q.data?.items ?? []).forEach((r) => seen.set(r.id, r)),
    );
    return [...seen.values()];
  }, [qPending.data, qOffered.data, qAccepted.data, qCollected.data, qClosed.data]);

  const chartsLoading =
    qPending.isLoading ||
    qOffered.isLoading ||
    qAccepted.isLoading ||
    qCollected.isLoading ||
    qClosed.isLoading;

  /** C-12: زمن الرد = offeredAt − createdAt بالساعات */
  const responseTimes = useMemo(
    () =>
      allRows
        .filter((r) => r.offeredAt)
        .map((r) => hoursSince(r.createdAt, new Date(r.offeredAt!)))
        .filter((h) => h >= 0),
    [allRows],
  );

  const responseHistogram = useMemo(() => {
    const counts = RESPONSE_BUCKETS.map(() => 0);
    responseTimes.forEach((h) => {
      const idx = RESPONSE_BUCKETS.findIndex((b) => h < b.max);
      counts[idx === -1 ? RESPONSE_BUCKETS.length - 1 : idx] += 1;
    });
    return RESPONSE_BUCKETS.map((b, i) => ({ label: b.label, value: counts[i]! }));
  }, [responseTimes]);

  const slowResponses = responseTimes.filter((h) => h >= 24).length;

  /** C-13: (العرض − الاقتراح) ÷ الاقتراح × ١٠٠ */
  const offerVsSuggested = useMemo(
    () =>
      allRows
        .filter((r) => r.offerPrice !== null && r.suggestedPrice > 0)
        .sort((a, b) => +new Date(b.offeredAt ?? b.createdAt) - +new Date(a.offeredAt ?? a.createdAt))
        .slice(0, 12)
        .map((r) => ({
          label: `${r.listing.title} ${r.listing.year}`,
          value: ((r.offerPrice! - r.suggestedPrice) / r.suggestedPrice) * 100,
        })),
    [allRows],
  );

  const noOfferYet = allRows.filter((r) => r.offerPrice === null).length;

  /* ═══════════════════════ أعمدة الجدول ═══════════════════════ */

  const columns: Array<Column<SellNowRequest>> = [
    {
      key: 'car',
      header: 'العربية',
      value: (r) => `${r.listing.title} ${r.listing.year}`,
      render: (r) => (
        <Link
          href={`/listings/${r.listing.id}`}
          onClick={(e) => e.stopPropagation()}
          className="group flex items-center gap-3"
          title="افتح الإعلان"
        >
          <CarThumb url={r.listing.imageUrl} alt={r.listing.title} size={44} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-content transition-colors group-hover:text-accent">
              {r.listing.title} {r.listing.year}
            </span>
            <span className="block text-caption text-content-sub">{r.listing.governorate}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'price',
      header: 'سعر الإعلان',
      align: 'end',
      sortable: true,
      value: (r) => r.listing.price,
      render: (r) => <span className="tnum text-content-sub">{formatEGP(r.listing.price)}</span>,
    },
    {
      key: 'suggested',
      header: 'الاقتراح ٩١٪',
      align: 'end',
      sortable: true,
      value: (r) => r.suggestedPrice,
      render: (r) => (
        <span className="tnum text-title font-extrabold text-content">
          {formatEGP(r.suggestedPrice)}
        </span>
      ),
    },
    {
      key: 'offer',
      header: 'العرض المصدَّر',
      align: 'end',
      sortable: true,
      hideBelow: 'lg',
      value: (r) => r.offerPrice ?? 0,
      render: (r) =>
        r.offerPrice === null ? (
          <span className="text-content-faint">—</span>
        ) : (
          <span className="inline-block text-end">
            <span className="tnum block font-bold text-content">{formatEGP(r.offerPrice)}</span>
            {r.offerPrice !== r.suggestedPrice ? (
              <span
                className="tnum block text-caption font-bold"
                style={{ color: diffInk(r.offerPrice - r.suggestedPrice) }}
              >
                {r.offerPrice > r.suggestedPrice ? '+' : '−'}
                {withThousands(Math.abs(r.offerPrice - r.suggestedPrice))} ج.م
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: 'seller',
      header: 'البائع',
      hideBelow: 'md',
      value: (r) => `${r.seller.name} ${maskPhone(r.seller.phone)}`,
      render: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold text-content">{r.seller.name}</span>
          <PhoneCopy phone={r.seller.phone} userId={r.seller.id} />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      value: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'waiting',
      header: 'مستني بقاله',
      align: 'end',
      sortable: true,
      value: (r) => Math.round(hoursSince(r.createdAt)),
      render: (r) => {
        const late = r.status === 'pending' && hoursSince(r.createdAt) > 24;
        return (
          <span
            className={`tnum font-bold ${late ? 'text-crit' : 'text-content-sub'}`}
            title={late ? 'عدّى ٢٤ ساعة وهو مستني قرار' : undefined}
          >
            {waitingFor(r.createdAt)}
          </span>
        );
      },
    },
    {
      key: 'expires',
      header: 'ينتهي في',
      align: 'end',
      hideBelow: 'xl',
      value: (r) => r.expiresAt ?? '',
      render: (r) =>
        r.status === 'offered' && r.expiresAt ? (
          <Countdown endsAt={r.expiresAt} size="sm" urgentBelow={3600} />
        ) : (
          <span className="text-content-faint">—</span>
        ),
    },
    {
      key: 'action',
      header: 'القرار',
      align: 'end',
      value: (r) => (r.status === 'pending' ? 'أصدر عرض' : r.status === 'accepted' ? 'تم الاستلام' : ''),
      render: (r) =>
        r.status === 'pending' ? (
          <Button
            size="sm"
            icon={<Send />}
            onClick={(e) => {
              e.stopPropagation();
              setOfferFor(r);
            }}
          >
            أصدر عرض
          </Button>
        ) : r.status === 'accepted' ? (
          <span className="inline-flex flex-col items-end gap-1">
            <Button
              variant="ink"
              size="sm"
              icon={<PackageCheck />}
              onClick={(e) => {
                e.stopPropagation();
                setCollectFor(r);
              }}
            >
              تم الاستلام
            </Button>
            <span className="text-caption text-content-faint">
              دلوقتي محجوزة — الاستلام هو اللي بيخليها متباعة
            </span>
          </span>
        ) : (
          <Link
            href={`/sell-now/${r.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sub font-bold text-content-sub transition-colors hover:text-accent"
          >
            التفاصيل
          </Link>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="بيع حالًا"
        subtitle="مش أرقام — دول ناس مستنية قرار منك بفلوس حقيقية، وكل ساعة تأخير بيحسّوها"
        motif="swoosh"
        actions={
          pendingCount.data && pendingCount.data > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-crit px-4 py-2 text-sub font-extrabold text-white">
              <AlertTriangle className="h-4 w-4" />
              <span className="tnum">{withThousands(pendingCount.data)}</span>
              مستنية قرارك
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sub font-bold text-white/80">
              <CheckCircle2 className="h-4 w-4" />
              مفيش طلب مستني
            </span>
          )
        }
      >
        <Tabs tabs={tabs} value={tab} onChange={goTab} onDark />
      </PageHeader>

      <Sheet>
        {/* ───── الفلو بالكامل في بانر واحد — مرة واحدة فوق الجدول ───── */}
        <Banner
          tone="accent"
          icon={<Info />}
          title="إزاي الطلب بيوصلك هنا"
          className="mb-6"
        >
          أول ما البائع يطلب، السيرفر بيحسب اقتراح = ٩١٪ من سعر الإعلان مقرّبة لأقرب ألف. لو سعر
          الإعلان ١٫٥ مليون أو أقل، العرض بيتبعت للبائع تلقائي من غير ما يعدّي عليك. فوق ١٫٥ مليون
          بس اللي بيقف في «مستنية قرارك» — لأن المبلغ كبير والقرار بشري. العرض اللي بتصدره صلاحيته
          ٢٤ ساعة، وبعدها بيتحوّل لمنتهي لوحده.
        </Banner>

        <SectionHeader
          title="الطابور"
          hint="بيتحدّث كل ٢٠ ثانية · الصف الأحمر معناه الطلب عدّى ٢٤ ساعة وصاحبه لسه مستني"
        />

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={active.isLoading}
          error={active.isError ? errorMessage(active.error) : undefined}
          onRetry={() => active.refetch()}
          emptyTitle={EMPTY[tab].title}
          emptyHint={EMPTY[tab].hint}
          rowTone={(r) => (r.status === 'pending' && hoursSince(r.createdAt) > 24 ? 'crit' : undefined)}
          onRowClick={(r) => {
            window.location.href = `/sell-now/${r.id}`;
          }}
          searchable
          searchPlaceholder="دوّر باسم العربية أو البائع…"
          exportName="sell-now"
          hasMore={Boolean(active.data?.nextCursor)}
          canPrev={trail.length > 0}
          onNext={() => {
            setTrail((t) => [...t, cursor]);
            setCursor(active.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            setCursor(trail[trail.length - 1] ?? null);
            setTrail((t) => t.slice(0, -1));
          }}
          pageInfo={`${withThousands(rows.length)} من ${withThousands(active.data?.total ?? rows.length)} طلب`}
        />

        {/* ═══════════════════════ التشارتس C-11 · C-12 · C-13 ═══════════════════════ */}
        <SectionHeader
          title="صحة الفيتشر"
          hint="القمع بيقول فين الناس بتقع، والهيستوجرام بيقول إحنا بنرد بعد قد إيه"
          className="mt-10"
        />

        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="C-11"
            title="قمع بيع حالًا"
            hint="طلب ← عرض ← قبول ← استلام"
            height={300}
            loading={funnel.isLoading}
            error={funnel.isError ? errorMessage(funnel.error) : undefined}
            isEmpty={!funnel.isLoading && (funnel.data?.steps.length ?? 0) === 0}
            tableColumns={[
              { key: 'label', label: 'الخطوة' },
              { key: 'count', label: 'عدد' },
            ]}
            tableRows={(funnel.data?.steps ?? []).map((s) => ({ label: s.label, count: s.count }))}
          >
            <Funnel
              steps={(funnel.data?.steps ?? []).map((s) => ({
                key: s.key,
                label: s.label,
                count: s.count,
                hint:
                  s.key === 'offered'
                    ? 'اللي واقف هنا غالبًا مستني قرارك'
                    : s.key === 'collected'
                      ? 'دي الخطوة اللي بتخلي العربية متباعة'
                      : undefined,
              }))}
            />
          </ChartFrame>

          <ChartFrame
            code="C-12"
            title="زمن الرد على الطلب"
            hint="offeredAt ناقص createdAt — الشكل بيكشف الذيل اللي المتوسط بيخبّيه"
            height={300}
            loading={chartsLoading}
            isEmpty={!chartsLoading && responseTimes.length === 0}
            footnote={
              slowResponses > 0
                ? `${withThousands(slowResponses)} طلب اتصدرله عرض بعد أكتر من ٢٤ ساعة`
                : 'كل العروض اتصدرت في أقل من ٢٤ ساعة'
            }
            tableColumns={[
              { key: 'label', label: 'الشريحة' },
              { key: 'value', label: 'طلبات' },
            ]}
            tableRows={responseHistogram}
          >
            <Histogram data={responseHistogram} height={300} unit="طلب" />
          </ChartFrame>
        </div>

        <ChartFrame
          code="C-13"
          title="العرض مقابل الاقتراح"
          hint="اتجاهين حوالين صفر — تيل = تحت الاقتراح، برتقالي = فوقه"
          height={320}
          loading={chartsLoading}
          isEmpty={!chartsLoading && offerVsSuggested.length === 0}
          footnote={`آخر ${withThousands(offerVsSuggested.length)} طلب اتصدرله عرض · مستبعد ${withThousands(noOfferYet)} طلب لسه من غير عرض — متحسبش صفر`}
          tableColumns={[
            { key: 'label', label: 'الإعلان' },
            { key: 'value', label: 'الفرق ٪' },
          ]}
          tableRows={offerVsSuggested.map((r) => ({
            label: r.label,
            value: Math.round(r.value * 10) / 10,
          }))}
        >
          <DivergingBars data={offerVsSuggested} height={320} maxLabelWidth={150} />
        </ChartFrame>

        {/* ───── تذكير بمعنى القيمة المعلّقة ───── */}
        <p className="mt-6 text-caption text-content-faint">
          إجمالي الاقتراحات المعلّقة في «مستنية قرارك»:{' '}
          <span className="tnum font-bold text-content-sub">
            {compactEGP(
              (qPending.data?.items ?? []).reduce((sum, r) => sum + r.suggestedPrice, 0),
            )}
          </span>{' '}
          — ده الالتزام اللي هيتفتح لو وافقت على كل الطلبات بالاقتراح.
        </p>
      </Sheet>

      <OfferDialog request={offerFor} open={Boolean(offerFor)} onClose={() => setOfferFor(null)} />
      <CollectDialog
        request={collectFor}
        open={Boolean(collectFor)}
        onClose={() => setCollectFor(null)}
      />
    </>
  );
}
