'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Building2,
  Car,
  ChevronDown,
  ChevronLeft,
  FileCheck2,
  FileX2,
  Gavel,
  IdCard,
  Info,
  Lock,
  Phone,
  Search,
  ShieldCheck,
  Trophy,
  UserCog,
  UserX,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Monogram,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  Skeleton,
  formatDateTimeAr,
  relTimeAr,
  withThousands,
  type Tone,
} from '@carq/ui';
import { errorMessage, useAudit } from '@carq/api-client';
import type { AuditAction, AuditEntry } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/audit` — سجل التدقيق (ADMIN_DASHBOARD_SPEC §4.9)
 *
 * ليه Timeline مش جدول: الجدول بيخلّي الصفوف متساوية في الأهمية،
 * والسجل ده قصة قرارات — مين عمل إيه على إيه وإمتى وليه. الشكل
 * العمودي بيخلّي التسلسل الزمني هو البطل، والسبب المكتوب يبان بارز
 * لأنه هو القيمة الحقيقية في السجل.
 *
 * السجل **append-only وعمره ما بيتمسح** (`X-6`) — عشان كده مفيش
 * ولا أكشن حذف أو تعديل في الشاشة دي. الحاجة الوحيدة المتاحة: القراءة.
 * ════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════ ترجمة الأكشنات ═══════════════════════ */

interface ActionMeta {
  label: string;
  /** إيه اللي حصل فعلًا — مش إعادة صياغة للمفتاح التقني */
  description: string;
  tone: Tone;
  icon: ReactNode;
}

const ACTIONS: Record<AuditAction, ActionMeta> = {
  'listing.flags_changed': {
    label: 'تغيير شارات الثقة',
    description: 'اتغيّرت شارات «ممشى موثّق» أو «مفحوص» على الإعلان',
    tone: 'accent',
    icon: <ShieldCheck />,
  },
  'listing.status_changed': {
    label: 'تغيير حالة الإعلان',
    description: 'الإعلان اتنقل لحالة تانية (نشط، مرفوض، متشال…)',
    tone: 'neutral',
    icon: <Car />,
  },
  'exhibition.contract_changed': {
    label: 'تغيير حالة التعاقد',
    description: 'مفتاح التعاقد اللي بيسمح للمعرض يزايد اتغيّر',
    tone: 'accent',
    icon: <Building2 />,
  },
  'exhibition.application_approved': {
    label: 'قبول طلب ترقية معرض',
    description: 'الحساب اترقّى لمعرض بعد مراجعة الأوراق',
    tone: 'ok',
    icon: <FileCheck2 />,
  },
  'exhibition.application_rejected': {
    label: 'رفض طلب ترقية معرض',
    description: 'الطلب اترفض والسبب اتبعت للمتقدّم',
    tone: 'crit',
    icon: <FileX2 />,
  },
  'auction_entry.paid': {
    label: 'تأكيد دفع رسوم الدخول',
    description: 'رسوم دخول المزاد اتأكّد استلامها — المعرض بقى يقدر يزايد',
    tone: 'ok',
    icon: <Wallet />,
  },
  'auction.created': {
    label: 'إنشاء مزاد',
    description: 'اتفتح مزاد جديد على إعلان',
    tone: 'neutral',
    icon: <Gavel />,
  },
  'auction.settled': {
    label: 'تسوية مزاد',
    description: 'المزاد اتقفل وفايز اتحدد',
    tone: 'ok',
    icon: <Trophy />,
  },
  'auction.failed': {
    label: 'مزاد قفل من غير مزايدات',
    description: 'الوقت خلص وماحدش زايد — العربية رجعت لحالتها',
    tone: 'warn',
    icon: <Gavel />,
  },
  'auction.defaulted': {
    label: 'تعليم مزاد متعثر',
    description: 'الفايز مااستكملش — المزاد اتعلّم متعثر',
    tone: 'crit',
    icon: <UserX />,
  },
  'sell_now.offered': {
    label: 'إصدار عرض بيع حالًا',
    description: 'اتصدر عرض شراء للبائع بصلاحية ٢٤ ساعة',
    tone: 'accent',
    icon: <Zap />,
  },
  'sell_now.collected': {
    label: 'تأكيد استلام العربية',
    description: 'العربية اتستلمت والإعلان بقى «متباع»',
    tone: 'ok',
    icon: <Car />,
  },
  'user.role_changed': {
    label: 'تغيير دور المستخدم',
    description: 'دور الحساب اتغيّر (فرد، معرض، أدمن)',
    tone: 'accent',
    icon: <UserCog />,
  },
  'user.status_changed': {
    label: 'تغيير حالة المستخدم',
    description: 'الحساب اتوقف أو اترجّع للعمل',
    tone: 'crit',
    icon: <UserX />,
  },
  'financing.status_changed': {
    label: 'تغيير حالة طلب تمويل',
    description: 'الطلب اتنقل في مساره (اتكلمنا، اتقبل، اترفض)',
    tone: 'neutral',
    icon: <Banknote />,
  },
  'financing.id_image_viewed': {
    label: 'فتح صورة بطاقة',
    description: 'اتفتحت صورة بطاقة بيانات شخصية — كل فتحة متسجّلة',
    tone: 'warn',
    icon: <IdCard />,
  },
  'user.phone_revealed': {
    label: 'كشف رقم تليفون',
    description: 'رقم مخفي اتكشف بقرار واعي — والكشف متسجّل',
    tone: 'warn',
    icon: <Phone />,
  },
};

function actionMeta(action: AuditAction): ActionMeta {
  return (
    ACTIONS[action] ?? {
      label: action,
      description: 'أكشن اتسجّل من غير ترجمة معروفة',
      tone: 'neutral' as Tone,
      icon: <Info />,
    }
  );
}

/* ═══════════════════════ الكيانات ═══════════════════════ */

interface EntityMeta {
  label: string;
  href?: (id: string) => string;
}

const ENTITIES: Record<string, EntityMeta> = {
  listing: { label: 'إعلان', href: (id) => `/listings/${id}` },
  exhibition: { label: 'معرض', href: (id) => `/exhibitions/${id}` },
  exhibition_application: { label: 'طلب ترقية', href: () => '/exhibitions/requests' },
  auction: { label: 'مزاد', href: (id) => `/auctions/${id}` },
  auction_entry: { label: 'دخول مزاد' },
  sell_now_request: { label: 'طلب بيع حالًا', href: (id) => `/sell-now/${id}` },
  user: { label: 'مستخدم', href: () => '/users' },
  financing_application: { label: 'طلب تمويل', href: (id) => `/financing/${id}` },
};

function entityLabel(type: string): string {
  return ENTITIES[type]?.label ?? type;
}

/* ═══════════════════════ الـpayload ═══════════════════════ */

/** المفاتيح اللي فيها السبب المكتوب — دي اللي بتتعرض بارزة */
const REASON_KEYS = ['reason', 'note', 'review_note', 'reviewNote'];

const PAYLOAD_LABELS: Record<string, string> = {
  reason: 'السبب',
  note: 'ملاحظة',
  price: 'السعر',
  status: 'الحالة',
  role: 'الدور',
  side: 'وجه البطاقة',
  key: 'مفتاح التخزين',
  km_verified: 'ممشى موثّق',
  kmVerified: 'ممشى موثّق',
  inspected: 'مفحوص',
  is_contracted: 'متعاقد',
  isContracted: 'متعاقد',
  fields: 'حقول مطلوبة',
};

function payloadReason(payload: Record<string, unknown>): string | null {
  for (const k of REASON_KEYS) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function payloadValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لأ';
  if (typeof v === 'number') return withThousands(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join(' · ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ═══════════════════════ الصفحة ═══════════════════════ */

const ENTITY_FILTERS = [
  { value: 'all', label: 'كل الكيانات' },
  ...Object.entries(ENTITIES).map(([value, meta]) => ({ value, label: meta.label })),
];

const ACTION_FILTERS = [
  { value: 'all', label: 'كل الأكشنات' },
  ...(Object.keys(ACTIONS) as AuditAction[]).map((a) => ({ value: a, label: ACTIONS[a].label })),
];

export default function AuditPage() {
  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  /** ترقيم بالـcursor — «أقدم» بينزل صفحة، و«أحدث» بيرجع */
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);
  const resetPage = () => {
    setCursor(null);
    setTrail([]);
  };

  const audit = useAudit({ entityType, action, cursor });

  const rows = useMemo(() => {
    const items = audit.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((e) => {
      const meta = actionMeta(e.action);
      const reason = payloadReason(e.payload) ?? '';
      return (
        e.actorName.toLowerCase().includes(needle) ||
        e.entityId.toLowerCase().includes(needle) ||
        entityLabel(e.entityType).toLowerCase().includes(needle) ||
        meta.label.toLowerCase().includes(needle) ||
        reason.toLowerCase().includes(needle)
      );
    });
  }, [audit.data, q]);

  const filtered = entityType !== 'all' || action !== 'all' || q.trim().length > 0;

  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        subtitle="كل أكشن كتابة في الداشبورد بيسيب أثر هنا — مين عمل إيه، على إيه، وليه"
        motif="underline"
        motifSize={240}
      />

      <Sheet>
        {/* ───────── قيد السجل — مش تحذير عابر ───────── */}
        <Banner
          tone="accent"
          icon={<Lock />}
          title="السجل ده append-only — عمره ما بيتمسح"
          className="mb-4"
        >
          مفيش أكشن حذف ولا تعديل في الشاشة دي بالتصميم (X-6). السجل هو الدليل الوحيد على
          القرارات اللي اتاخدت، وأي إمكانية مسح كانت هتلغي قيمته من أساسه.
        </Banner>

        {/* ───────── الفلاتر ───────── */}
        <SectionHeader
          title="فلترة السجل"
          hint={
            audit.data
              ? `${withThousands(rows.length)} حدث ظاهر من ${withThousands(audit.data.total ?? audit.data.items.length)} مطابق للفلتر`
              : undefined
          }
        />

        <Card className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="نوع الكيان">
              <Select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value);
                  resetPage();
                }}
              >
                {ENTITY_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="نوع الأكشن">
              <Select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  resetPage();
                }}
              >
                {ACTION_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="بحث" hint="بيدوّر في الفاعل والسبب ورقم الكيان">
              <div className="relative">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-content-faint" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="اسم الأدمن، السبب، رقم الكيان…"
                  className="ps-9"
                />
              </div>
            </Field>
          </div>

          {/* حدود الشاشة دي — لازم تبان جنب الفلاتر مش في ملف بعيد */}
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3.5 text-caption text-content-sub">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              الشاشة بتبعت `cursor` وبتقلّب صفحة صفحة — الباك لازم يحترمه (§6.3). البحث
              النصي بيدوّر في الصفحة المعروضة بس؛ فلترة الكيان والأكشن بتحصل في السيرفر
              على السجل كله.
            </span>
          </p>
        </Card>

        {/* ───────── الـTimeline ───────── */}
        {audit.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
            ))}
          </div>
        ) : audit.isError ? (
          <Card>
            <ErrorState message={errorMessage(audit.error)} onRetry={() => void audit.refetch()} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              title={filtered ? 'مفيش أحداث بالفلاتر دي' : 'السجل لسه فاضي'}
              hint={
                filtered
                  ? 'وسّع الفلترة أو امسح البحث — الـ٢٠٠ صف المتحمّلين ممكن مايكونش فيهم الحدث اللي بتدوّر عليه.'
                  : 'أول ما يتاخد قرار من الداشبورد (شارة ثقة، تعاقد، عرض بيع حالًا) هيظهر هنا فورًا.'
              }
              icon={<Info className="h-6 w-6" />}
            />
          </Card>
        ) : (
          <ol className="relative">
            {/* الخط الرأسي بتاع التسلسل الزمني */}
            <span
              aria-hidden="true"
              className="absolute bottom-4 top-4 start-[19px] w-px bg-line"
            />

            {rows.map((entry) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                open={openId === entry.id}
                onToggle={() => setOpenId((cur) => (cur === entry.id ? null : entry.id))}
              />
            ))}
          </ol>
        )}

        {/* ───────── الترقيم: أحدث / أقدم ───────── */}
        {!audit.isLoading && !audit.isError && (trail.length > 0 || audit.data?.nextCursor) ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="tnum text-caption text-content-sub">
              {audit.data?.total
                ? `${withThousands(trail.length * 25 + 1)} – ${withThousands(trail.length * 25 + (audit.data?.items.length ?? 0))} من ${withThousands(audit.data.total)} حدث`
                : null}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={trail.length === 0}
                onClick={() => {
                  const prev = trail.length ? (trail[trail.length - 1] ?? null) : null;
                  setTrail((t) => t.slice(0, -1));
                  setCursor(prev);
                }}
              >
                الأحدث
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!audit.data?.nextCursor}
                onClick={() => {
                  setTrail((t) => [...t, cursor]);
                  setCursor(audit.data?.nextCursor ?? null);
                }}
              >
                أقدم
              </Button>
            </div>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <p className="mt-5 flex items-center gap-2 text-caption text-content-faint">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            القراءة بس — مفيش تعديل ولا حذف لأي صف في السجل ده.
          </p>
        ) : null}
      </Sheet>
    </>
  );
}

/* ═══════════════════════ صف الـTimeline ═══════════════════════ */

function TimelineRow({
  entry,
  open,
  onToggle,
}: {
  entry: AuditEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = actionMeta(entry.action);
  const reason = payloadReason(entry.payload);
  const entity = ENTITIES[entry.entityType];
  const href = entity?.href ? entity.href(entry.entityId) : null;
  const extras = Object.entries(entry.payload).filter(([k]) => !REASON_KEYS.includes(k));

  const iconTone =
    meta.tone === 'crit'
      ? 'bg-crit-soft text-crit'
      : meta.tone === 'warn'
        ? 'bg-warn-soft text-warn'
        : meta.tone === 'ok'
          ? 'bg-ok-soft text-ok'
          : meta.tone === 'accent'
            ? 'bg-accent-soft text-accent'
            : 'bg-muted-soft text-content-sub';

  return (
    <li className="relative flex animate-fade gap-4 pb-4">
      {/* الأيقونة على الخط */}
      <span
        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone} [&>svg]:h-[18px] [&>svg]:w-[18px]`}
      >
        {meta.icon}
      </span>

      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-title text-content">{meta.label}</span>
              <Badge tone="neutral">{entityLabel(entry.entityType)}</Badge>
            </div>
            <p className="mt-1 text-sub text-content-sub">{meta.description}</p>
          </div>

          <div className="shrink-0 text-end">
            <p className="text-sub font-bold text-content">{relTimeAr(entry.createdAt)}</p>
            <p className="tnum text-caption text-content-faint">
              {formatDateTimeAr(entry.createdAt)}
            </p>
          </div>
        </div>

        {/* الفاعل + الكيان */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
          <span className="flex items-center gap-2">
            <Monogram text={entry.actorName.slice(0, 2)} size={26} />
            <span className="text-sub font-bold text-content">{entry.actorName}</span>
          </span>

          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-sub font-bold text-accent transition-opacity hover:opacity-75"
            >
              افتح {entityLabel(entry.entityType)}
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="text-sub text-content-faint">
              {entityLabel(entry.entityType)} — مفيش صفحة تفاصيل
            </span>
          )}

          <span className="tnum text-caption text-content-faint">{entry.entityId}</span>
        </div>

        {/* السبب المكتوب — ده أهم حاجة في الصف */}
        {reason ? (
          <p className="mt-3 rounded-sm border-s-2 border-accent bg-accent-soft/60 px-3.5 py-2.5 text-sub font-bold text-content">
            {reason}
          </p>
        ) : null}

        {/* الـpayload — مطوي بالافتراضي */}
        {extras.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 text-caption font-bold text-content-sub transition-colors hover:text-content"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              />
              {open ? 'إخفاء التفاصيل' : `تفاصيل الأكشن (${withThousands(extras.length)})`}
            </button>

            {open ? (
              <dl className="mt-2 animate-fade divide-y divide-line rounded-sm border border-line bg-surface-alt px-3.5">
                {extras.map(([k, v]) => (
                  <div key={k} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                    <dt className="min-w-[120px] text-caption font-bold text-content-sub">
                      {PAYLOAD_LABELS[k] ?? k}
                    </dt>
                    <dd className="min-w-0 flex-1 break-words text-sub text-content">
                      {payloadValue(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
