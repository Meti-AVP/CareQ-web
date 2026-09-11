'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Building2,
  Eye,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  User as UserIcon,
  Wrench,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  Monogram,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Tabs,
  formatDateAr,
  formatPhone,
  maskPhone,
  relTimeAr,
  useToast,
  withThousands,
  type Column,
  type TabDef,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useOverview,
  useRevealPhone,
  useSetUserRole,
  useSetUserStatus,
  useUsers,
  type User,
  type UserRole,
  type UserStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/users` — المستخدمين (ADMIN_DASHBOARD_SPEC §4.7 · §10.2)
 *
 * أخطر أكشن في الشاشة دي **الترقية لـ`exhibition`**: دي الشرط الأول
 * من ٣ للمزايدة بفلوس حقيقية (A-1) — فعشان كده تأكيد مكتوب + سبب.
 *
 * التليفونات مخفية جزئيًا افتراضيًا، والكشف أكشن واعٍ **وبيتسجّل**
 * في سجل التدقيق — مش زرار تجميلي.
 * ════════════════════════════════════════════════════════════════
 */

const ROLE_META: Record<UserRole, { label: string; tone: Tone; icon: ReactNode }> = {
  individual: { label: 'فرد', tone: 'neutral', icon: <UserIcon /> },
  exhibition: { label: 'معرض', tone: 'accent', icon: <Building2 /> },
  admin: { label: 'أدمن', tone: 'ink', icon: <Wrench /> },
};

const STATUS_META: Record<UserStatus, { label: string; tone: Tone }> = {
  active: { label: 'نشط', tone: 'ok' },
  suspended: { label: 'موقوف', tone: 'crit' },
  deleted: { label: 'متشال', tone: 'neutral' },
};

const STATUS_FILTERS = [
  { value: 'all' as const, label: 'كل الحالات' },
  { value: 'active' as const, label: 'نشط' },
  { value: 'suspended' as const, label: 'موقوف' },
];

type RoleTab = UserRole | 'all';
type StatusFilter = 'all' | 'active' | 'suspended';

type Pending =
  | { kind: 'role'; user: User }
  | { kind: 'suspend'; user: User }
  | { kind: 'unsuspend'; user: User }
  | null;

export default function UsersPage() {
  const toast = useToast();
  const [role, setRole] = useState<RoleTab>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [seen, setSeen] = useState<Array<string | null>>([]);
  const [pending, setPending] = useState<Pending>(null);

  const overview = useOverview();
  const users = useUsers({ role, status, cursor });
  const setUserRole = useSetUserRole();
  const setUserStatus = useSetUserStatus();

  const rows = users.data?.items ?? [];
  const counts = overview.data?.users;

  const resetPaging = () => {
    setCursor(null);
    setSeen([]);
  };

  const tabs: TabDef[] = [
    { key: 'all', label: 'الكل', count: counts?.total },
    { key: 'individual', label: 'أفراد', count: counts?.individual },
    { key: 'exhibition', label: 'معارض', count: counts?.exhibition },
    { key: 'admin', label: 'أدمن', count: counts?.admin },
  ];

  const closeDialog = () => setPending(null);

  const confirmAction = (reason: string) => {
    if (!pending) return;
    const done = (title: string) => {
      closeDialog();
      toast({ title, body: 'السبب اتسجّل في سجل التدقيق', tone: 'ok' });
    };
    const fail = (e: unknown) => toast({ title: errorMessage(e), tone: 'crit' });

    if (pending.kind === 'role') {
      setUserRole.mutate(
        { id: pending.user.id, role: 'exhibition', reason },
        { onSuccess: () => done('الحساب بقى معرض'), onError: fail },
      );
      return;
    }
    setUserStatus.mutate(
      {
        id: pending.user.id,
        status: pending.kind === 'suspend' ? 'suspended' : 'active',
        reason,
      },
      {
        onSuccess: () =>
          done(pending.kind === 'suspend' ? 'الحساب اتوقف' : 'الحساب رجع يشتغل'),
        onError: fail,
      },
    );
  };

  const columns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'الاسم',
      sortable: true,
      value: (u) => u.name,
      render: (u) => (
        <div className="flex items-center gap-3">
          <Monogram text={u.name.slice(0, 2)} size={34} dark={u.role === 'admin'} />
          <div className="min-w-0">
            <p className="truncate font-bold text-content">{u.name}</p>
            <p className="text-caption text-content-faint">{u.area ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'التليفون',
      value: (u) => maskPhone(u.phone),
      render: (u) => <PhoneCell user={u} />,
    },
    {
      key: 'role',
      header: 'الدور',
      value: (u) => ROLE_META[u.role].label,
      render: (u) => (
        <Badge tone={ROLE_META[u.role].tone} icon={ROLE_META[u.role].icon}>
          {ROLE_META[u.role].label}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      value: (u) => STATUS_META[u.status].label,
      render: (u) => (
        <div>
          <Badge tone={STATUS_META[u.status].tone}>{STATUS_META[u.status].label}</Badge>
          {u.status === 'suspended' && u.suspendedReason ? (
            <p className="mt-1 max-w-[180px] truncate text-caption text-content-faint">
              {u.suspendedReason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'governorate',
      header: 'المحافظة',
      hideBelow: 'lg',
      sortable: true,
      value: (u) => u.governorate ?? '',
      render: (u) => <span className="text-content-sub">{u.governorate ?? '—'}</span>,
    },
    {
      key: 'listingsCount',
      header: 'الإعلانات',
      align: 'center',
      sortable: true,
      hideBelow: 'md',
      value: (u) => u.listingsCount,
      render: (u) => <span className="tnum font-bold">{withThousands(u.listingsCount)}</span>,
    },
    {
      key: 'createdAt',
      header: 'تاريخ التسجيل',
      sortable: true,
      hideBelow: 'xl',
      value: (u) => u.createdAt,
      render: (u) => <span className="text-content-sub">{formatDateAr(u.createdAt)}</span>,
    },
    {
      key: 'lastSeenAt',
      header: 'آخر ظهور',
      sortable: true,
      hideBelow: 'lg',
      value: (u) => u.lastSeenAt ?? '',
      render: (u) => (
        <span className="text-content-sub">{u.lastSeenAt ? relTimeAr(u.lastSeenAt) : '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'أكشنات',
      align: 'end',
      value: () => '',
      render: (u) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {u.role === 'individual' ? (
            <Button
              variant="outline"
              size="sm"
              icon={<Building2 />}
              onClick={() => setPending({ kind: 'role', user: u })}
            >
              رقّي لمعرض
            </Button>
          ) : null}
          {u.status === 'active' ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<PauseCircle />}
              className="text-crit hover:bg-crit-soft hover:text-crit"
              onClick={() => setPending({ kind: 'suspend', user: u })}
            >
              إيقاف
            </Button>
          ) : u.status === 'suspended' ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<PlayCircle />}
              onClick={() => setPending({ kind: 'unsuspend', user: u })}
            >
              إلغاء الإيقاف
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المستخدمين"
        subtitle="الأدوار والإيقاف — وأي كشف لرقم تليفون بيتسجّل باسمك"
        motif="swoosh"
      >
        <Tabs
          tabs={tabs}
          value={role}
          onChange={(k) => {
            setRole(k as RoleTab);
            resetPaging();
          }}
          onDark
        />
      </PageHeader>

      <Sheet>
        {/* ───── الأكشنات دي لسه ناقصة في الباك (§6.2) ───── */}
        <Banner
          tone="warn"
          icon={<ShieldCheck />}
          title="ترقية الدور والإيقاف لسه مش موجودين في الباك اند"
          className="mb-6"
        >
          الـendpoints بتاعة الأدوار والحالة (قسم ٦٫٢) لسه اتكتبت في المواصفة ومااتنفذتش. اللي
          بيحصل هنا دلوقتي بيتنفّذ على بيانات الموك وبيتسجّل في سجل التدقيق المحلي — الشكل والسبب
          والتأكيد هما هما اللي هيشتغلوا مع الباك.
        </Banner>

        <SectionHeader
          title="الحسابات"
          hint="الترقية لمعرض هي الشرط الأول من ٣ للمزايدة — خد بالك"
          action={
            <SegmentedControl
              options={STATUS_FILTERS}
              value={status}
              onChange={(v) => {
                setStatus(v);
                resetPaging();
              }}
              size="sm"
            />
          }
        />

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          loading={users.isLoading}
          error={users.error ? errorMessage(users.error) : undefined}
          onRetry={() => users.refetch()}
          emptyTitle="مفيش حسابات بالفلاتر دي"
          emptyHint="غيّر التبويب أو فلتر الحالة."
          searchable
          searchPlaceholder="دوّر بالاسم أو التليفون…"
          exportName="users"
          hasMore={Boolean(users.data?.nextCursor)}
          canPrev={seen.length > 0}
          onNext={() => {
            setSeen((s) => [...s, cursor]);
            setCursor(users.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            setCursor(seen[seen.length - 1] ?? null);
            setSeen((s) => s.slice(0, -1));
          }}
          pageInfo={
            users.data
              ? `${withThousands(rows.length)} من ${withThousands(users.data.total ?? rows.length)} حساب`
              : undefined
          }
        />
      </Sheet>

      {/* ══════════ ترقية الدور — أخطر أكشن في الشاشة ══════════ */}
      <ConfirmDialog
        open={pending?.kind === 'role'}
        onClose={closeDialog}
        onConfirm={confirmAction}
        title="ترقية الحساب لمعرض"
        impact="الترقية بتدي الحساب دور «معرض» — وده الشرط الأول من ٣ للمزايدة بفلوس حقيقية، وبتفتحله بوابة المعارض. متعملهاش غير لما تكون اتأكدت من السجل التجاري والبطاقة الضريبية."
        confirmLabel="رقّي الحساب"
        tone="accent"
        typeToConfirm="ترقية"
        reasonLabel="سبب الترقية"
        loading={setUserRole.isPending}
      >
        {pending?.kind === 'role' ? (
          <p className="rounded-sm bg-surface-alt px-3.5 py-2.5 text-sub text-content-sub">
            الحساب: <span className="font-bold text-content">{pending.user.name}</span> ·{' '}
            <span className="tnum">{maskPhone(pending.user.phone)}</span>
          </p>
        ) : null}
      </ConfirmDialog>

      {/* ══════════ إيقاف ══════════ */}
      <ConfirmDialog
        open={pending?.kind === 'suspend'}
        onClose={closeDialog}
        onConfirm={confirmAction}
        title="إيقاف الحساب"
        impact="الحساب مش هيقدر يدخل ولا ينشر ولا يزايد من اللحظة دي. الإعلانات القايمة بتفضل زي ما هي لحد ما تتصرف فيها."
        confirmLabel="أوقف الحساب"
        tone="crit"
        reasonLabel="سبب الإيقاف"
        reasonHint="بيتسجّل في سجل التدقيق وبيظهر جنب الحساب"
        loading={setUserStatus.isPending}
      >
        {pending?.kind === 'suspend' ? (
          <p className="rounded-sm bg-surface-alt px-3.5 py-2.5 text-sub text-content-sub">
            الحساب: <span className="font-bold text-content">{pending.user.name}</span>
          </p>
        ) : null}
      </ConfirmDialog>

      {/* ══════════ إلغاء الإيقاف ══════════ */}
      <ConfirmDialog
        open={pending?.kind === 'unsuspend'}
        onClose={closeDialog}
        onConfirm={confirmAction}
        title="إلغاء إيقاف الحساب"
        impact="الحساب هيرجع يشتغل عادي فورًا — دخول ونشر ومزايدة لو دوره معرض."
        confirmLabel="ارجّع الحساب"
        tone="accent"
        reasonLabel="سبب الإرجاع"
        loading={setUserStatus.isPending}
      >
        {pending?.kind === 'unsuspend' ? (
          <p className="rounded-sm bg-surface-alt px-3.5 py-2.5 text-sub text-content-sub">
            الحساب: <span className="font-bold text-content">{pending.user.name}</span>
            {pending.user.suspendedReason ? (
              <span className="mt-1 block text-caption text-content-faint">
                اتوقف بسبب: {pending.user.suspendedReason}
              </span>
            ) : null}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/* ═══════════════════════ خلية التليفون ═══════════════════════ */

/**
 * الرقم مخفي جزئيًا، والكشف **أكشن واعٍ وبيتسجّل** (§10.2).
 * الرقم المكشوف بيعيش في state الصف بس — مابيتخزنش ومابيترجعش
 * في التصدير، وبيختفي مع أول تحديث للجدول.
 */
function PhoneCell({ user }: { user: User }) {
  const [shown, setShown] = useState<string | null>(null);
  const reveal = useRevealPhone();
  const toast = useToast();

  if (shown) {
    return (
      <div>
        <p className="tnum font-bold text-content">{formatPhone(shown)}</p>
        <p className="text-caption text-content-faint">الكشف اتسجّل باسمك</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="الرقم مخفي — الكشف بيتسجّل في سجل التدقيق باسمك"
      disabled={reveal.isPending}
      onClick={() =>
        reveal.mutate(
          { userId: user.id },
          {
            onSuccess: (phone) => setShown(phone),
            onError: (e) => toast({ title: errorMessage(e), tone: 'crit' }),
          },
        )
      }
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-alt px-3 py-1.5 text-caption font-bold text-content-sub transition-colors hover:border-line-strong hover:text-content disabled:opacity-50"
    >
      <Eye className="h-3.5 w-3.5" />
      <span className="tnum">{maskPhone(user.phone)}</span>
    </button>
  );
}
