'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  Eye,
  FileQuestion,
  FileText,
  Handshake,
  Lock,
  Phone,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  ErrorState,
  Pill,
  SectionHeader,
  PageHeader,
  Sheet,
  Skeleton,
  Tabs,
  formatDateAr,
  formatDateTimeAr,
  hoursSince,
  maskPhone,
  useToast,
  waitingFor,
  withThousands,
  type Column,
  type TabDef,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useApplication,
  useApplications,
  useRevealPhone,
  useReviewApplication,
  type ApplicationStatus,
  type DocumentKind,
  type ExhibitionApplication,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/exhibitions/requests` — طلبات الترقية لمعرض
 * (EXHIBITION_PORTAL_SPEC §2 · ADMIN_DASHBOARD_SPEC §4.4)
 *
 * مفيش «إنشاء حساب معرض» — المعرض حساب فرد **اترقّى** (I-1، I-2).
 * الموافقة معاملة واحدة بتعمل ٣ حاجات: تنشئ صف المعرض، وترقّي الدور،
 * وتعلّم verified. **التعاقد مش جزء منها** — ده قرار تاني بيفتح المزايدة.
 *
 * الأوراق (السجل التجاري والبطاقة الضريبية والبطاقة الشخصية) بيانات
 * شخصية وتجارية متخزنة تحت بادئة `private/` — بنفس عقيدة صور البطاقة
 * في التمويل (F-6): ممنوع رابط عام، والعرض برابط موقّع ٥ دقايق بس،
 * وكل فتحة متسجّلة.
 * ════════════════════════════════════════════════════════════════
 */

type ReviewTab = 'submitted' | 'needs_info' | 'approved' | 'rejected';

const TAB_DEFS: Array<{ key: ReviewTab; label: string }> = [
  { key: 'submitted', label: 'مستنية مراجعة' },
  { key: 'needs_info', label: 'محتاجة استكمال' },
  { key: 'approved', label: 'متوافق عليها' },
  { key: 'rejected', label: 'مرفوضة' },
];

const STATUS_BADGE: Record<
  ApplicationStatus,
  { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' | 'accent' }
> = {
  draft: { label: 'مسودة', tone: 'neutral' },
  submitted: { label: 'مستنية مراجعة', tone: 'accent' },
  needs_info: { label: 'محتاجة استكمال', tone: 'warn' },
  approved: { label: 'متوافق عليها', tone: 'ok' },
  rejected: { label: 'مرفوضة', tone: 'crit' },
};

const DOC_LABELS: Record<DocumentKind, string> = {
  commercial_register: 'صورة السجل التجاري',
  tax_card: 'صورة البطاقة الضريبية',
  owner_id_front: 'بطاقة المالك — الوش',
  owner_id_back: 'بطاقة المالك — الضهر',
  venue_photo: 'صور المعرض',
  logo: 'لوجو المعرض',
};

/** الحقول اللي ينفع تطلب استكمالها — بتروح للمعرض في شاشة needs_info */
const REQUESTABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'commercial_register', label: 'صورة السجل التجاري' },
  { key: 'tax_card', label: 'صورة البطاقة الضريبية' },
  { key: 'owner_id_front', label: 'بطاقة المالك — الوش' },
  { key: 'owner_id_back', label: 'بطاقة المالك — الضهر' },
  { key: 'venue_photo', label: 'صور المعرض' },
  { key: 'commercial_register_number', label: 'رقم السجل التجاري' },
  { key: 'tax_id', label: 'الرقم الضريبي' },
  { key: 'address', label: 'العنوان بالتفصيل' },
  { key: 'phone', label: 'تليفون المعرض' },
];

type Mode = 'review' | 'approve' | 'reject' | 'request-info' | null;

/** صف بيانات جوه ديالوج المراجعة */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-2 last:border-0">
      <p className="text-caption text-content-sub">{label}</p>
      <p className="mt-0.5 text-body text-content">{value}</p>
    </div>
  );
}

export default function ExhibitionRequestsPage() {
  const toast = useToast();

  const [tab, setTab] = useState<ReviewTab>('submitted');
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [openedDoc, setOpenedDoc] = useState<DocumentKind | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  /** FND-036 — ثابتة على ساعة الموك المجمّدة عشان حساب SLA ما يتأثرش
   * بمرور وقت التشغيل الفعلي. */
  const now = new Date(nowMs());

  /** الصفحات بالـcursor — مكدّس عشان «السابق» يشتغل، وبيتصفّر مع تغيير التبويب */
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);
  const resetPage = () => {
    setCursor(null);
    setTrail([]);
  };

  /** الأربع استعلامات دايمًا شغالة — عدادات التبويبات من `total` بتاعها */
  const submitted = useApplications('submitted');
  const needsInfo = useApplications('needs_info');
  const approved = useApplications('approved');
  const rejected = useApplications('rejected');

  const byTab = { submitted, needs_info: needsInfo, approved, rejected } as const;
  /** جدول التبويب الحالي بيتبع الـcursor — والعدادات فوق مش بتتأثر بيه */
  const current = useApplications(tab, cursor);

  const detail = useApplication(selectedId);
  const review = useReviewApplication();
  const revealPhone = useRevealPhone();

  const app = detail.data;

  const tabs: TabDef[] = useMemo(
    () =>
      TAB_DEFS.map((t) => ({
        key: t.key,
        label: t.label,
        count: byTab[t.key].data?.total ?? 0,
        // المستنية مراجعة بس هي اللي بتنده على قرار
        alert: t.key === 'submitted',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitted.data, needsInfo.data, approved.data, rejected.data],
  );

  const openReview = (row: ExhibitionApplication) => {
    setSelectedId(row.id);
    setOpenedDoc(null);
    setOwnerPhone(null);
    setFields(row.requestedFields ?? []);
    setMode('review');
  };

  const closeAll = () => {
    setMode(null);
    setSelectedId('');
    setOpenedDoc(null);
    setOwnerPhone(null);
    setFields([]);
  };

  const toggleField = (key: string) =>
    setFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));

  const submitReview = (action: 'approve' | 'reject' | 'request-info', reason: string) => {
    if (!app) return;
    if (action === 'request-info' && fields.length === 0) {
      toast({
        title: 'اختار الحقول المطلوبة الأول',
        body: 'من غير تحديد، المعرض مش هيعرف يكمّل إيه بالظبط.',
        tone: 'crit',
      });
      return;
    }
    review.mutate(
      { id: app.id, action, reason, fields: action === 'request-info' ? fields : undefined },
      {
        onSuccess: () => {
          toast({
            title:
              action === 'approve'
                ? 'الطلب اتوافق عليه — المعرض اتعمل والدور اترقّى'
                : action === 'reject'
                  ? 'الطلب اترفض'
                  : 'اتبعت طلب استكمال للمعرض',
            body:
              action === 'approve'
                ? 'فاضل التعاقد — من غيره المعرض مش هيقدر يزايد.'
                : 'السبب اللي كتبته بيوصل لصاحب الطلب وبيتسجّل في التدقيق.',
            tone: action === 'reject' ? 'crit' : 'ok',
          });
          closeAll();
        },
        onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
      },
    );
  };

  const columns: Array<Column<ExhibitionApplication>> = [
    {
      key: 'name',
      header: 'اسم المعرض',
      value: (a) => a.name,
      render: (a) => (
        <div className="min-w-[160px]">
          <p className="font-bold text-content">{a.name}</p>
          <p className="mt-0.5 text-caption text-content-sub">{a.area}</p>
        </div>
      ),
    },
    { key: 'ownerName', header: 'المالك', value: (a) => a.ownerName },
    {
      key: 'phone',
      header: 'التليفون',
      hideBelow: 'md',
      value: (a) => maskPhone(a.phone),
      render: (a) => <span className="tnum whitespace-nowrap">{maskPhone(a.phone)}</span>,
    },
    { key: 'governorate', header: 'المحافظة', hideBelow: 'md', value: (a) => a.governorate },
    {
      key: 'commercialRegister',
      header: 'السجل التجاري',
      hideBelow: 'lg',
      value: (a) => a.commercialRegister,
      render: (a) => <span className="tnum whitespace-nowrap">{a.commercialRegister}</span>,
    },
    {
      key: 'taxId',
      header: 'الرقم الضريبي',
      hideBelow: 'lg',
      value: (a) => a.taxId,
      render: (a) => <span className="tnum whitespace-nowrap">{a.taxId}</span>,
    },
    {
      key: 'createdAt',
      header: 'تاريخ التقديم',
      sortable: true,
      value: (a) => a.createdAt,
      render: (a) => (
        <div className="min-w-[110px]">
          <p className="whitespace-nowrap text-content">{formatDateAr(a.createdAt)}</p>
          {a.status === 'submitted' ? (
            <p
              className={
                hoursSince(a.createdAt, now) > 72
                  ? 'mt-0.5 text-caption font-bold text-crit'
                  : 'mt-0.5 text-caption text-content-faint'
              }
            >
              مستني من {waitingFor(a.createdAt, now)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      value: (a) => STATUS_BADGE[a.status].label,
      render: (a) => (
        <Badge tone={STATUS_BADGE[a.status].tone} icon={<ClipboardList />}>
          {STATUS_BADGE[a.status].label}
        </Badge>
      ),
    },
    {
      key: 'review',
      header: '',
      align: 'end',
      width: 110,
      value: () => '',
      render: () => (
        <Button variant="outline" size="sm" icon={<Eye />}>
          راجع
        </Button>
      ),
    },
  ];

  const docEntries = Object.entries(app?.documents ?? {}) as Array<[DocumentKind, string]>;
  const canDecide = app ? app.status === 'submitted' || app.status === 'needs_info' : false;

  return (
    <>
      <PageHeader
        title="طلبات الترقية لمعرض"
        subtitle="المعرض حساب فرد اترقّى — الموافقة بتنشئ المعرض وبترقّي الدور في معاملة واحدة"
        motif="underline"
        actions={
          <Link href="/exhibitions">
            <Button variant="white" size="sm" icon={<Building2 />}>
              المعارض والتعاقد
            </Button>
          </Link>
        }
      >
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(k) => {
            setTab(k as ReviewTab);
            resetPage();
          }}
          onDark
        />
      </PageHeader>

      <Sheet>
        <Banner
          tone="accent"
          icon={<Handshake />}
          title="الموافقة بتعمل حاجتين — والتعاقد لسه حاجة تالتة"
          className="mb-6"
        >
          الموافقة بتنشئ صف المعرض وبتحوّل دور المستخدم لـexhibition وبتعلّمه موثّق، كله في معاملة
          واحدة. بعد كده المعرض بيقدر ينشر ويستقبل رسايل — بس مش بيقدر يزايد لحد ما تديله التعاقد من
          شاشة المعارض. ده مقصود: الدور بيقول نوع الحساب، والعقد بيقول شغال ولا لأ.
        </Banner>

        <SectionHeader
          title={TAB_DEFS.find((t) => t.key === tab)?.label ?? 'الطلبات'}
          hint={`${withThousands(current.data?.total ?? 0)} طلب — اضغط على الصف تفتح المراجعة`}
        />

        <DataTable<ExhibitionApplication>
          caption="جدول طلبات ترقية المعارض"
          rows={current.data?.items ?? []}
          columns={columns}
          rowKey={(a) => a.id}
          loading={current.isLoading}
          error={current.isError ? errorMessage(current.error) : undefined}
          onRetry={() => void current.refetch()}
          emptyTitle={
            tab === 'submitted' ? 'مفيش طلبات مستنية مراجعة' : 'مفيش طلبات في الحالة دي'
          }
          emptyHint={
            tab === 'submitted'
              ? 'الطابور فاضي دلوقتي. أي طلب جديد هيظهر هنا خلال ٢٠ ثانية من غير ما تعمل تحديث.'
              : 'لما تتاخد قرارات على الطلبات، هتلاقيها متجمّعة هنا.'
          }
          onRowClick={openReview}
          rowTone={(a) =>
            a.status === 'submitted' && hoursSince(a.createdAt, now) > 72 ? 'warn' : undefined
          }
          searchable
          searchPlaceholder="دوّر باسم المعرض أو المالك…"
          exportName={`exhibition-applications-${tab}`}
          hasMore={Boolean(current.data?.nextCursor)}
          canPrev={trail.length > 0}
          onNext={() => {
            setTrail((t) => [...t, cursor]);
            setCursor(current.data?.nextCursor ?? null);
          }}
          onPrev={() => {
            const prev = trail.length ? (trail[trail.length - 1] ?? null) : null;
            setTrail((t) => t.slice(0, -1));
            setCursor(prev);
          }}
          pageInfo={
            current.data?.total
              ? `${withThousands(trail.length * 25 + 1)} – ${withThousands(trail.length * 25 + (current.data?.items.length ?? 0))} من ${withThousands(current.data.total)} طلب`
              : undefined
          }
        />
      </Sheet>

      {/* ═════════ ديالوج المراجعة ═════════ */}
      <Dialog
        open={mode === 'review'}
        onClose={closeAll}
        size="lg"
        title={app?.name ?? 'مراجعة الطلب'}
        subtitle={
          app ? `${app.ownerName} · ${app.governorate} — ${app.area}` : 'بيانات الطلب والأوراق'
        }
        footer={
          canDecide ? (
            <>
              <Button variant="ghost" onClick={closeAll}>
                اقفل
              </Button>
              <Button
                variant="outline"
                icon={<FileQuestion />}
                onClick={() => setMode('request-info')}
              >
                اطلب استكمال
              </Button>
              <Button variant="danger" icon={<X />} onClick={() => setMode('reject')}>
                ارفض
              </Button>
              <Button variant="primary" icon={<Check />} onClick={() => setMode('approve')}>
                وافق
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={closeAll}>
              اقفل
            </Button>
          )
        }
      >
        {detail.isError ? (
          <ErrorState message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
        ) : detail.isLoading || !app ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_BADGE[app.status].tone} icon={<ClipboardList />}>
                {STATUS_BADGE[app.status].label}
              </Badge>
              <span className="text-caption text-content-sub">
                اتقدّم {formatDateTimeAr(app.createdAt)}
              </span>
              {app.reviewedAt ? (
                <span className="text-caption text-content-sub">
                  · آخر مراجعة {formatDateTimeAr(app.reviewedAt)}
                </span>
              ) : null}
            </div>

            {app.reviewNote ? (
              <Banner
                tone={app.status === 'rejected' ? 'crit' : 'warn'}
                icon={<AlertTriangle />}
                title={app.status === 'rejected' ? 'سبب الرفض' : 'المطلوب استكماله'}
              >
                {app.reviewNote}
                {app.requestedFields && app.requestedFields.length > 0 ? (
                  <span className="mt-1 block">
                    الحقول المطلوبة:{' '}
                    {app.requestedFields
                      .map((f) => REQUESTABLE_FIELDS.find((r) => r.key === f)?.label ?? f)
                      .join(' · ')}
                  </span>
                ) : null}
              </Banner>
            ) : null}

            {/* ───── بيانات الطلب ───── */}
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              <div>
                <Row label="اسم المعرض" value={app.name} />
                <Row label="اسم المالك" value={app.ownerName} />
                <div className="border-b border-line py-2">
                  <p className="text-caption text-content-sub">تليفون المعرض</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <p className="tnum text-body text-content">{ownerPhone ?? maskPhone(app.phone)}</p>
                    {ownerPhone ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Phone />}
                        loading={revealPhone.isPending}
                        onClick={() =>
                          revealPhone.mutate(
                            { userId: app.applicant.id },
                            {
                              onSuccess: (p) => setOwnerPhone(p),
                              onError: (err) => toast({ title: errorMessage(err), tone: 'crit' }),
                            },
                          )
                        }
                      >
                        اكشف الرقم
                      </Button>
                    )}
                  </div>
                  <p className="mt-0.5 text-caption text-content-faint">
                    الكشف بيتسجّل في سجل التدقيق
                  </p>
                </div>
                <Row label="المحافظة والمنطقة" value={`${app.governorate} — ${app.area}`} />
                <Row label="العنوان بالتفصيل" value={app.address} />
              </div>
              <div>
                <Row label="رقم السجل التجاري" value={app.commercialRegister} />
                <Row label="الرقم الضريبي" value={app.taxId} />
                <Row label="بيقدّم فحص فني؟" value={app.inspectionService ? 'أيوه' : 'لأ'} />
                <Row label="ملاحظة التمويل" value={app.financingNote || 'مفيش'} />
                <Row
                  label="صاحب الطلب"
                  value={`${app.applicant.name} · الدور الحالي: ${
                    app.applicant.role === 'exhibition' ? 'exhibition' : 'individual'
                  }`}
                />
              </div>
            </div>

            {/* ───── الأوراق ───── */}
            <div>
              <SectionHeader
                title="الأوراق"
                hint="مفاتيح تخزين خاصة — بتتفتح برابط موقّع ٥ دقايق، وكل فتحة متسجّلة"
              />
              {docEntries.length === 0 ? (
                <Card className="border-warn/30">
                  <p className="text-sub text-content">الطلب ده مرفقش أي ورقة.</p>
                  <p className="mt-1 text-caption text-content-sub">
                    من غير السجل التجاري والبطاقة الضريبية مافيش أساس قانوني للموافقة — اطلب استكمال.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {docEntries.map(([kind]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setOpenedDoc(kind)}
                      className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface-alt px-4 py-3 text-start transition-colors hover:border-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-content-faint" />
                        <span className="truncate text-sub font-bold text-content">
                          {DOC_LABELS[kind]}
                        </span>
                      </span>
                      <span className="shrink-0 text-caption font-bold text-accent">اعرض</span>
                    </button>
                  ))}
                </div>
              )}

              {openedDoc ? (
                <div className="mt-3 rounded-md border border-warn/25 bg-warn-soft px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="text-title text-warn">
                        بيانات شخصية وتجارية — كل فتحة متسجّلة
                      </p>
                      <p className="mt-1 text-sub text-warn/90">
                        {DOC_LABELS[openedDoc]} — الرابط بيبقى صالح ٥ دقايق بس. ممنوع تحميل الورقة أو
                        تخزينها أو نسخها لأي مكان تاني. قانون حماية البيانات المصري ١٥١/٢٠٢٠ بينطبق
                        عليها.
                      </p>

                      <div className="mt-3 rounded-sm border border-line bg-surface px-3.5 py-3">
                        <p className="text-sub font-bold text-content">
                          الرابط الموقّع لسه مش متاح — الـendpoint ناقص في الباك
                        </p>
                        <p className="mt-1 text-caption text-content-sub">
                          المطلوب: GET /v1/admin/exhibitions/applications/{app.id}/document?kind=
                          {openedDoc} → {'{ url, expiresAt }'}. لحد ما يتبني، الورقة مش هتتعرض هنا —
                          وده أحسن من إننا نبني رابط عام بإيدنا ونكسر F-6.
                        </p>
                        <p className="tnum mt-2 break-all text-caption text-content-faint">
                          مفتاح التخزين: {app.documents[openedDoc]}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenedDoc(null)}
                      aria-label="اقفل الورقة"
                      className="shrink-0 text-warn transition-opacity hover:opacity-70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Dialog>

      {/* ═════════ موافقة ═════════ */}
      <ConfirmDialog
        open={mode === 'approve'}
        onClose={() => setMode('review')}
        title="الموافقة على طلب الترقية"
        impact="الموافقة بتنشئ صف المعرض وبترقّي دور المستخدم لـexhibition وبتعلّمه موثّق — كله في معاملة واحدة. التعاقد قرار تاني منفصل: من غيره المعرض مش هيقدر يزايد."
        confirmLabel="وافق وأنشئ المعرض"
        tone="accent"
        requireReason
        reasonLabel="سبب الموافقة"
        reasonHint="اكتب إيه اللي راجعته بالظبط — بيتسجّل في سجل التدقيق ومابيتمسحش"
        loading={review.isPending}
        onConfirm={(reason) => submitReview('approve', reason)}
      >
        {app ? (
          <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
            <p className="text-sub font-bold text-content">{app.name}</p>
            <p className="mt-1 text-caption text-content-sub">
              {app.ownerName} · {app.governorate} — {app.area}
            </p>
            <p className="mt-1 text-caption text-content-sub">
              السجل التجاري: {app.commercialRegister} · الرقم الضريبي: {app.taxId}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-caption text-content-faint">
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              بعد الموافقة روح لشاشة المعارض لو ناوي تديله التعاقد كمان.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>

      {/* ═════════ رفض ═════════ */}
      <ConfirmDialog
        open={mode === 'reject'}
        onClose={() => setMode('review')}
        title="رفض طلب الترقية"
        impact="الرفض بيقفل الطلب، وصاحبه مش هيقدر يقدّم تاني غير بعد ٣٠ يوم. السبب اللي هتكتبه هو اللي هيشوفه — فاكتبه بوضوح."
        confirmLabel="ارفض الطلب"
        tone="crit"
        requireReason
        reasonLabel="سبب الرفض"
        reasonHint="بيوصل لصاحب الطلب وبيتسجّل في سجل التدقيق"
        loading={review.isPending}
        onConfirm={(reason) => submitReview('reject', reason)}
      >
        {app ? (
          <div className="rounded-sm border border-line bg-surface-alt px-4 py-3">
            <p className="text-sub font-bold text-content">{app.name}</p>
            <p className="mt-1 text-caption text-content-sub">
              {app.ownerName} · {app.governorate} — {app.area}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>

      {/* ═════════ طلب استكمال ═════════ */}
      <ConfirmDialog
        open={mode === 'request-info'}
        onClose={() => setMode('review')}
        title="طلب استكمال بيانات"
        impact="الطلب هيرجع لصاحبه بحالة «محتاجة استكمال» مع السبب والحقول اللي علّمتها — ولما يبعتها تاني هيرجع لطابور المراجعة."
        confirmLabel="ابعت طلب الاستكمال"
        tone="accent"
        requireReason
        reasonLabel="المطلوب بالظبط"
        reasonHint="اكتبه بلغة صاحب المعرض — «صورة السجل التجاري مش واضحة، محتاجين نسخة أوضح وسارية»"
        loading={review.isPending}
        onConfirm={(reason) => submitReview('request-info', reason)}
      >
        <div>
          <p className="mb-2 text-sub font-bold text-content">الحقول المطلوب استكمالها</p>
          <div className="flex flex-wrap gap-2">
            {REQUESTABLE_FIELDS.map((f) => {
              const on = fields.includes(f.key);
              return (
                <Pill key={f.key} active={on} onClick={() => toggleField(f.key)}>
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                  {f.label}
                </Pill>
              );
            })}
          </div>
          <p className="mt-2 text-caption text-content-faint">
            {fields.length === 0
              ? 'لازم تختار حقل واحد على الأقل — من غير تحديد المعرض مش هيعرف يكمّل إيه.'
              : `${withThousands(fields.length)} حقل متعلّم — هيبان معلّم في فورم المعرض.`}
          </p>
        </div>
      </ConfirmDialog>

    </>
  );
}
