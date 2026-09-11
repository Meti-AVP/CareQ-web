'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardList,
  Gavel,
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
  Input,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  StatTile,
  Switch,
  formatDateAr,
  relTimeAr,
  secondsUntil,
  useToast,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  useAuctionEntries,
  useAuctions,
  useExhibitions,
  useSetContract,
  useUsers,
  type Exhibition,
} from '@carq/api-client';
import { ConditionMarks, type BidConditions } from './_lib/conditions';

/**
 * ════════════════════════════════════════════════════════════════
 * `/exhibitions` — المعارض والتعاقد (ADMIN_DASHBOARD_SPEC §4.4) ★
 *
 * دي الشاشة اللي بتحيي المزاد. المزايدة محتاجة **٣ شروط مستقلة**
 * (A-1)، والأدمن بيتحكم من هنا في واحد منهم بس: `is_contracted`.
 * عشان كده الجدول بيعرض الشروط الثلاثة جنب بعض — مش حالة واحدة —
 * ومعاهم كود الخطأ اللي المعرض هيصطدم بيه لو حاول يزايد دلوقتي.
 *
 * الدور والتعاقد **حاجتين منفصلتين عن قصد** (BUSINESS_RULES §1):
 * معرض عقده خلص بيفضل معرض، بس مابيزايدش.
 * ════════════════════════════════════════════════════════════════
 */

type TriFilter = 'all' | 'yes' | 'no';

const CONTRACT_FILTER = [
  { value: 'all' as TriFilter, label: 'الكل' },
  { value: 'yes' as TriFilter, label: 'متعاقد' },
  { value: 'no' as TriFilter, label: 'مش متعاقد' },
];

const VERIFIED_FILTER = [
  { value: 'all' as TriFilter, label: 'الكل' },
  { value: 'yes' as TriFilter, label: 'موثّق' },
  { value: 'no' as TriFilter, label: 'مش موثّق' },
];

const triToBool = (v: TriFilter) => (v === 'all' ? undefined : v === 'yes');

/** الأيام الباقية في العقد — من `contractEndsAt` نفسه */
const daysLeft = (endsAt: string) => Math.floor(secondsUntil(endsAt) / 86_400);

export default function ExhibitionsPage() {
  const router = useRouter();
  const toast = useToast();

  const [contracted, setContracted] = useState<TriFilter>('all');
  const [verified, setVerified] = useState<TriFilter>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<Exhibition | null>(null);

  // الفلترة بتحصل في السيرفر — الديباونس عشان مانرميش نداء لكل حرف
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const exhibitions = useExhibitions({
    contracted: triToBool(contracted),
    verified: triToBool(verified),
    q: q || undefined,
  });
  /** الشرط ١: دور المستخدم — بيتقرا من المستخدمين مش من صف المعرض */
  const exhibitionUsers = useUsers({ role: 'exhibition' });
  /** الشرط ٣: رسوم دخول مدفوعة لمزاد شغال دلوقتي */
  const liveAuctions = useAuctions('live');
  const entries = useAuctionEntries();

  const setContract = useSetContract();

  const rows = exhibitions.data?.items ?? [];
  const total = exhibitions.data?.total ?? rows.length;

  const roleUserIds = useMemo(
    () => new Set((exhibitionUsers.data?.items ?? []).map((u) => u.id)),
    [exhibitionUsers.data],
  );

  const liveIds = useMemo(
    () => new Set((liveAuctions.data?.items ?? []).map((a) => a.id)),
    [liveAuctions.data],
  );

  /** معرض ⇐ هل دفع دخول أي مزاد شغال؟ (مفيش صف = مش مسجّل أصلًا) */
  const paidInLive = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const e of entries.data ?? []) {
      if (!liveIds.has(e.auctionId)) continue;
      map.set(e.exhibitionId, (map.get(e.exhibitionId) ?? false) || e.paidAt !== null);
    }
    return map;
  }, [entries.data, liveIds]);

  const conditionsOf = (e: Exhibition): BidConditions => ({
    role: exhibitionUsers.isLoading ? null : roleUserIds.has(e.userId),
    contracted: e.isContracted,
    entryPaid: paidInLive.has(e.id) ? paidInLive.get(e.id)! : null,
  });

  const contractedCount = rows.filter((e) => e.isContracted).length;

  /** عقود بتخلص خلال ٣٠ يوم — ومنهم اللي خلص فعلًا والمفتاح لسه مفتوح */
  const expiring = useMemo(
    () =>
      rows
        .filter((e) => e.isContracted && e.contractEndsAt && daysLeft(e.contractEndsAt) <= 30)
        .sort((a, b) => daysLeft(a.contractEndsAt!) - daysLeft(b.contractEndsAt!)),
    [rows],
  );

  const columns: Array<Column<Exhibition>> = [
    {
      key: 'name',
      header: 'المعرض',
      value: (e) => e.name,
      render: (e) => (
        <div className="min-w-[160px]">
          <p className="font-bold text-content">{e.name}</p>
          <p className="mt-0.5 text-caption text-content-sub">{e.ownerName}</p>
        </div>
      ),
    },
    {
      key: 'place',
      header: 'المحافظة والمنطقة',
      hideBelow: 'md',
      value: (e) => `${e.governorate} — ${e.area}`,
      render: (e) => (
        <div className="min-w-[110px]">
          <p className="text-content">{e.governorate}</p>
          <p className="mt-0.5 text-caption text-content-sub">{e.area}</p>
        </div>
      ),
    },
    {
      key: 'verified',
      header: 'موثّق',
      align: 'center',
      value: (e) => (e.verified ? 'موثّق' : 'مش موثّق'),
      render: (e) =>
        e.verified ? (
          <Badge tone="ok" icon={<ShieldCheck />}>
            موثّق
          </Badge>
        ) : (
          <Badge tone="neutral" icon={<ShieldOff />}>
            مش موثّق
          </Badge>
        ),
    },
    {
      key: 'contract',
      header: 'متعاقد (المفتاح)',
      value: (e) => (e.isContracted ? 'متعاقد' : 'مش متعاقد'),
      render: (e) => {
        const left = e.contractEndsAt ? daysLeft(e.contractEndsAt) : null;
        return (
          // الضغط على المفتاح مايفتحش صفحة المعرض
          <div role="presentation" onClick={(ev) => ev.stopPropagation()} className="min-w-[160px]">
            <Switch
              checked={e.isContracted}
              tone="ok"
              onChange={() => setTarget(e)}
              label={e.isContracted ? 'متعاقد' : 'مش متعاقد'}
            />
            {e.isContracted && e.contractEndsAt ? (
              <p
                className={
                  left !== null && left <= 30
                    ? 'mt-1 text-caption font-bold text-warn'
                    : 'mt-1 text-caption text-content-faint'
                }
              >
                {left !== null && left <= 0
                  ? `العقد خلص ${formatDateAr(e.contractEndsAt)} والمفتاح لسه مفتوح`
                  : `باقي ${withThousands(left ?? 0)} يوم — لحد ${formatDateAr(e.contractEndsAt)}`}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'conditions',
      header: 'الشروط الثلاثة للمزايدة',
      value: (e) => {
        const c = conditionsOf(e);
        return `${c.role ? 'الدور' : 'مفيش دور'} · ${c.contracted ? 'متعاقد' : 'مش متعاقد'} · ${
          c.entryPaid ? 'مدفوع' : 'مش مدفوع'
        }`;
      },
      render: (e) => <ConditionMarks c={conditionsOf(e)} />,
    },
    {
      key: 'listingsCount',
      header: 'إعلانات',
      align: 'center',
      sortable: true,
      hideBelow: 'lg',
      value: (e) => e.listingsCount,
      render: (e) => <span className="tnum">{withThousands(e.listingsCount)}</span>,
    },
    {
      key: 'bidsCount',
      header: 'مزايدات',
      align: 'center',
      sortable: true,
      hideBelow: 'lg',
      value: (e) => e.bidsCount,
      render: (e) => <span className="tnum">{withThousands(e.bidsCount)}</span>,
    },
    {
      key: 'winsCount',
      header: 'مكاسب',
      align: 'center',
      sortable: true,
      hideBelow: 'lg',
      value: (e) => e.winsCount,
      render: (e) => <span className="tnum">{withThousands(e.winsCount)}</span>,
    },
    {
      key: 'lastActiveAt',
      header: 'آخر نشاط',
      hideBelow: 'xl',
      value: (e) => e.lastActiveAt ?? '',
      render: (e) => (
        <span className="whitespace-nowrap text-content-sub">
          {e.lastActiveAt ? relTimeAr(e.lastActiveAt) : 'مفيش نشاط'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المعارض والتعاقد"
        subtitle="المفتاح اللي بيحيي المزاد — التعاقد بيدي المعرض حق المزايدة بفلوس"
        motif="oval"
        actions={
          <Link href="/exhibitions/requests">
            <Button variant="white" size="sm" icon={<ClipboardList />}>
              طلبات الترقية
            </Button>
          </Link>
        }
      />

      <Sheet>
        {/* ───── الشروط الثلاثة: الشرح قبل الجدول ───── */}
        <Banner
          tone="accent"
          icon={<Gavel />}
          title="المزايدة محتاجة ٣ شروط مستقلة — وكل شرط بيفشل برسالة مختلفة"
          className="mb-4"
        >
          <span className="block">
            ١) دور المستخدم لازم يكون exhibition — بيتظبط من الموافقة على طلب الترقية.
          </span>
          <span className="block">
            ٢) المعرض لازم يكون متعاقد — ده المفتاح اللي في الجدول تحت، وقرار منفصل عن الدور.
          </span>
          <span className="block">
            ٣) رسوم دخول المزاد الحالي لازم تكون مدفوعة — لكل مزاد لوحده، مش مرة واحدة للأبد.
          </span>
          <span className="mt-1 block">
            السيرفر بيتحقق منهم بالترتيب ده، فأول شرط ناقص هو اللي بيحدد كود الخطأ اللي المعرض
            هيشوفه.
          </span>
        </Banner>

        {/* ───── فخ معروف: مفيش طريقة تنشئ معرض جديد ───── */}
        <Banner
          tone="warn"
          icon={<AlertTriangle />}
          title="مفيش endpoint بينشئ معرض دلوقتي"
          className="mb-6"
        >
          المفتاح اللي تحت بيشتغل على صفوف المعارض الموجودة بس. المعرض الجديد بيتولد بطريقتين:
          الموافقة على طلب ترقية، أو إدخال الصف بالإيد في الداتابيز. مطلوب في الباك:
          POST /v1/admin/exhibitions.
        </Banner>

        {/* ───── الأرقام اللي بتحتاج قرار ───── */}
        <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="معارض متعاقدة"
            value={contractedCount}
            icon={<Building2 />}
            hint="يقدروا يزايدوا لو دفعوا رسوم دخول المزاد"
          />
          <StatTile
            label="معارض مش متعاقدة"
            value={Math.max(0, rows.length - contractedCount)}
            tone="warn"
            icon={<Building2 />}
            hint="بيشوفوا المزاد بس المزايدة مقفولة عليهم"
          />

          <Card className="border-warn/30 md:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption text-content-sub">عقود بتخلص خلال ٣٠ يوم</p>
                <p className="tnum mt-1 text-h1 leading-none text-warn">
                  {withThousands(expiring.length)}
                </p>
              </div>
              <CalendarClock className="h-4 w-4 shrink-0 text-content-faint" />
            </div>

            {expiring.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {expiring.slice(0, 3).map((e) => {
                  const left = daysLeft(e.contractEndsAt!);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-caption">
                      <Link
                        href={`/exhibitions/${e.id}`}
                        className="truncate font-bold text-content hover:text-accent"
                      >
                        {e.name}
                      </Link>
                      <span className="tnum shrink-0 text-warn">
                        {left <= 0 ? 'خلص خلاص' : `باقي ${withThousands(left)} يوم`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <p className="mt-3 text-caption text-content-sub">
              is_contracted عمود بوليان — يعني محدش بيقفله غير الأدمن بإيده. لو العقد خلص والمفتاح
              فاضل مفتوح، المعرض هيفضل يزايد بعقد منتهي. الصح إن القرار يتعلّق بتاريخ انتهاء في
              الداتابيز (contract_ends_at) وجوب يومي بيقفل المنتهي لوحده.
            </p>
          </Card>
        </div>

        {/* ───── الجدول ───── */}
        <SectionHeader
          title="كل المعارض"
          hint={`${withThousands(total)} معرض — اضغط على الصف تفتح ملف المعرض`}
        />

        <DataTable<Exhibition>
          rows={rows}
          columns={columns}
          rowKey={(e) => e.id}
          loading={exhibitions.isLoading}
          error={exhibitions.isError ? errorMessage(exhibitions.error) : undefined}
          onRetry={() => void exhibitions.refetch()}
          emptyTitle="مفيش معارض بالفلاتر دي"
          emptyHint="جرّب تشيل الفلاتر، أو راجع طلبات الترقية — الموافقة على طلب هي اللي بتنشئ معرض جديد."
          emptyAction={
            <Link href="/exhibitions/requests">
              <Button variant="outline" size="sm" icon={<ClipboardList />}>
                طلبات الترقية
              </Button>
            </Link>
          }
          onRowClick={(e) => router.push(`/exhibitions/${e.id}`)}
          rowTone={(e) =>
            e.isContracted && e.contractEndsAt && daysLeft(e.contractEndsAt) <= 30
              ? 'warn'
              : undefined
          }
          exportName="exhibitions"
          toolbar={
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
                placeholder="دوّر باسم المعرض أو المالك…"
                className="h-10 min-w-[200px] flex-1 rounded-full"
              />
              <div className="flex items-center gap-2">
                <span className="text-caption text-content-sub">التعاقد</span>
                <SegmentedControl
                  size="sm"
                  options={CONTRACT_FILTER}
                  value={contracted}
                  onChange={setContracted}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-caption text-content-sub">التوثيق</span>
                <SegmentedControl
                  size="sm"
                  options={VERIFIED_FILTER}
                  value={verified}
                  onChange={setVerified}
                />
              </div>
            </div>
          }
        />
      </Sheet>

      {/* ───── تأكيد مزدوج على المفتاح (§10.5) ───── */}
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target?.isContracted ? 'إيقاف تعاقد المعرض' : 'منح التعاقد للمعرض'}
        impact={
          target?.isContracted
            ? 'ده بيسحب من المعرض حق المزايدة فورًا. أي مزاد شغال هو داخل فيه مش هيقدر يكمّل فيه، ورسوم الدخول اللي دفعها متبقاش نافعة.'
            : 'ده بيدي المعرض حق المزايدة بفلوس. متأكد؟'
        }
        confirmLabel={target?.isContracted ? 'أوقف التعاقد' : 'امنح التعاقد'}
        tone={target?.isContracted ? 'crit' : 'accent'}
        requireReason
        reasonLabel="سبب القرار"
        reasonHint="بيتسجّل في سجل التدقيق (exhibition.contract_changed) ومابيتمسحش"
        loading={setContract.isPending}
        onConfirm={(reason) => {
          if (!target) return;
          const next = !target.isContracted;
          setContract.mutate(
            { id: target.id, isContracted: next, reason },
            {
              onSuccess: () => {
                toast({
                  title: next ? 'المعرض بقى متعاقد' : 'التعاقد اتوقف',
                  body: next
                    ? 'فاضل يدفع رسوم دخول المزاد عشان يقدر يزايد فيه.'
                    : 'المعرض فاضل معرض — بس مابيزايدش.',
                  tone: next ? 'ok' : 'info',
                });
                setTarget(null);
              },
              onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
            },
          );
        }}
      >
        {target ? (
          <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
            <p className="text-sub font-bold text-content">{target.name}</p>
            <p className="mt-1 text-caption text-content-sub">
              {target.ownerName} · {target.governorate} — {target.area}
            </p>
            <p className="mt-1 text-caption text-content-sub">
              السجل التجاري: {target.commercialRegister ?? 'مش مسجّل'} · الرقم الضريبي:{' '}
              {target.taxId ?? 'مش مسجّل'}
            </p>
            <p className="mt-2 text-caption text-content-faint">
              التعاقد شرط واحد من ثلاثة — الدور ورسوم دخول المزاد قرارات منفصلة عنه.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
