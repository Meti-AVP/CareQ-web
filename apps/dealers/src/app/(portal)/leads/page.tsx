'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  Clock,
  Info,
  MessageSquareDashed,
  MessagesSquare,
  Phone,
  Reply,
  SendHorizontal,
  Timer,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChartFrame,
  DataTable,
  Dialog,
  Monogram,
  PageHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  StatTile,
  TimeSeriesLine,
  axisDayLabel,
  cairoDayKey,
  cn,
  maskPhone,
  relTimeAr,
  seriesColor,
  useToast,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useLeadMessages,
  useMarkLeadRead,
  useMyLeads,
  useSendLeadMessage,
} from '@carq/api-client';
import type { ChatMessage, ChatThread } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * `/leads` — الاستفسارات (EXHIBITION_PORTAL_SPEC §3 · D-04)
 *
 * مؤشرات + صندوق رد كامل: المعرض بيفتح المحادثة من الجدول ويرد
 * من غير ما يسيب الداشبورد (طلب مالك المنتج). الرد بيتزامن مع
 * تطبيق CarQ لأن الاتنين بيكلموا نفس المحادثة على السيرفر.
 * فتح المحادثة بيصفّر «مش مقروء»، وأول رد بيثبّت مؤشر زمن أول رد.
 * ════════════════════════════════════════════════════════════════
 */

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;

/** «٤٥ دقيقة» · «٣ ساعات» — نفس منطق relTimeAr بس لمدة مش لتاريخ */
function minutesLabel(m: number): string {
  if (m < 60) return `${withThousands(m)} دقيقة`;
  const h = Math.round(m / 60);
  if (h === 1) return 'ساعة';
  if (h === 2) return 'ساعتين';
  if (h < 24) return h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  const d = Math.round(h / 24);
  return d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} أيام`;
}

export default function LeadsPage() {
  const leads = useMyLeads();
  const rows = useMemo(() => leads.data ?? [], [leads.data]);

  const [openThread, setOpenThread] = useState<ChatThread | null>(null);
  const markRead = useMarkLeadRead();
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());

  const openConversation = (t: ChatThread) => {
    setOpenThread(t);
    if (t.unread > 0) markRead.mutate({ threadId: t.id });
  };

  const unreadTotal = rows.reduce((s, t) => s + t.unread, 0);
  const unanswered = rows.filter((t) => t.firstResponseMinutes === null).length;

  const avgFirstResponse = useMemo(() => {
    const answered = rows.filter(
      (t): t is ChatThread & { firstResponseMinutes: number } => t.firstResponseMinutes !== null,
    );
    if (!answered.length) return 0;
    return Math.round(
      answered.reduce((s, t) => s + t.firstResponseMinutes, 0) / answered.length,
    );
  }, [rows]);

  /** D-04: استفسارات / يوم — الأيام الفاضية بصفر مش محذوفة */
  const daily = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of rows) {
      const key = cairoDayKey(t.lastMessageAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const now = Date.now();
    return Array.from({ length: WINDOW_DAYS }).map((_, i) => {
      const d = new Date(now - (WINDOW_DAYS - 1 - i) * DAY_MS);
      return { label: axisDayLabel(d), count: counts.get(cairoDayKey(d)) ?? 0 };
    });
  }, [rows]);

  const columns: Array<Column<ChatThread>> = [
    {
      key: 'listing',
      header: 'العربية',
      width: 260,
      value: (t) => `${t.listing.title} ${t.listing.year}`,
      render: (t) => (
        <div className="flex items-center gap-3">
          {t.listing.imageUrl ? (
            <img
              src={t.listing.imageUrl}
              alt=""
              className="h-11 w-16 shrink-0 rounded-xs object-cover"
            />
          ) : (
            <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-xs bg-muted-soft text-content-faint">
              <Car className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sub font-bold text-content">{t.listing.title}</p>
            <p className="tnum text-caption text-content-sub">
              {t.listing.year} · {withThousands(t.listing.km)} كم
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'with',
      header: 'المستفسر',
      width: 180,
      value: (t) => t.withName,
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <Monogram text={t.withName.slice(0, 1)} size={32} />
          <div className="min-w-0">
            <p className="truncate text-sub font-bold text-content">{t.withName}</p>
            <p className="tnum flex items-center gap-1 text-caption text-content-sub">
              <Phone className="h-3 w-3" />
              {maskPhone(t.withPhone)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'lastMessage',
      header: 'آخر رسالة',
      value: (t) => t.lastMessage,
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-sub text-content">{t.lastMessage}</p>
          <p className="tnum text-caption text-content-faint">
            {withThousands(t.messagesCount)} رسالة في المحادثة
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'lastMessageAt',
      header: 'آخر نشاط',
      width: 120,
      sortable: true,
      value: (t) => -new Date(t.lastMessageAt).getTime(),
      render: (t) => (
        <span className="text-sub text-content-sub">{relTimeAr(t.lastMessageAt, now)}</span>
      ),
    },
    {
      key: 'unread',
      header: 'مش مقروء',
      width: 108,
      align: 'center',
      sortable: true,
      value: (t) => t.unread,
      render: (t) =>
        t.unread > 0 ? (
          <Badge tone="crit" icon={<MessagesSquare />}>
            {withThousands(t.unread)}
          </Badge>
        ) : (
          <span className="text-caption text-content-faint">—</span>
        ),
    },
    {
      key: 'firstResponse',
      header: 'زمن أول رد',
      width: 150,
      sortable: true,
      value: (t) => t.firstResponseMinutes ?? 99_999,
      render: (t) =>
        t.firstResponseMinutes === null ? (
          <Badge tone="warn" icon={<Timer />}>
            مردتش لسه
          </Badge>
        ) : (
          <Badge tone={t.firstResponseMinutes <= 60 ? 'ok' : 'neutral'} icon={<Clock />}>
            {minutesLabel(t.firstResponseMinutes)}
          </Badge>
        ),
      hideBelow: 'lg',
    },
    {
      key: 'reply',
      header: '',
      width: 110,
      align: 'center',
      value: () => '',
      render: (t) => (
        <Button
          variant={t.firstResponseMinutes === null ? 'primary' : 'outline'}
          size="sm"
          icon={<Reply />}
          onClick={(e) => {
            e.stopPropagation(); // الصف نفسه بيفتح المحادثة — مانفتحهاش مرتين
            openConversation(t);
          }}
        >
          رد
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الاستفسارات"
        subtitle="مين سأل على عربية، وبقاله قد إيه مستني رد"
        motif="swoosh"
      />

      <Sheet>
        <Banner
          tone="neutral"
          icon={<Info />}
          title="بترد من هنا ومن تطبيق CarQ عادي — نفس المحادثة"
          className="mb-6 animate-rise"
        >
          افتح أي محادثة من الجدول ورد على طول. الرد بيتسجّل على نفس المحادثة اللي في التطبيق،
          وفتحها هنا بيصفّر عداد «مش مقروء».
        </Banner>

        <SectionHeader title="الأرقام الأساسية" hint="آخر ١٤ يوم" />
        <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="محادثات مفتوحة"
            value={rows.length}
            icon={<MessagesSquare />}
            hint="كل استفسار على عربية من عربياتك"
          />
          <StatTile
            label="رسايل مش مقروءة"
            value={unreadTotal}
            icon={<MessagesSquare />}
            alertWhenPositive
            hint="افتح التطبيق ورد — دول مشترين بيسألوا دلوقتي"
          />
          <StatTile
            label="مردتش عليهم"
            value={unanswered}
            icon={<Timer />}
            tone={unanswered > 0 ? 'warn' : 'ok'}
            hint="محادثات لسه من غير أول رد منك"
          />
          <StatTile
            label="متوسط أول رد"
            value={avgFirstResponse}
            icon={<Clock />}
            format={(n) => (n > 0 ? minutesLabel(n) : '—')}
            tone={avgFirstResponse > 0 && avgFirstResponse <= 60 ? 'ok' : 'neutral'}
            hint="الرد في أول ساعة بيضاعف فرصة المعاينة"
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartFrame
            code="D-04"
            title="استفسارات / يوم"
            hint="سلسلة واحدة فمفيش legend"
            loading={leads.isLoading}
            error={leads.error ? errorMessage(leads.error) : undefined}
            isEmpty={!leads.isLoading && daily.every((d) => d.count === 0)}
            footnote="الأيام الفاضية بتتعرض بصفر مش محذوفة. ولحد ما الباك يرجّع تاريخ فتح المحادثة، اليوم محسوب من آخر نشاط فيها."
            tableColumns={[
              { key: 'label', label: 'اليوم' },
              { key: 'count', label: 'استفسارات' },
            ]}
            tableRows={daily}
          >
            <TimeSeriesLine
              data={daily}
              series={[{ key: 'count', label: 'استفسارات', color: seriesColor(0) }]}
              unit="استفسار"
            />
          </ChartFrame>

          <Card className="flex flex-col justify-center">
            <p className="text-h2 text-content">ليه زمن أول رد مهم</p>
            <p className="mt-2 text-body text-content-sub">
              المشتري بيسأل على أكتر من عربية في نفس الوقت. أول معرض بيرد هو اللي بيحجز المعاينة —
              مش أرخص سعر. عشان كده الرقم ده مؤشر خدمة مش إحصائية.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="ok" icon={<Clock />}>
                أقل من ساعة: ممتاز
              </Badge>
              <Badge tone="neutral" icon={<Clock />}>
                من ساعة لأربعة: مقبول
              </Badge>
              <Badge tone="warn" icon={<Timer />}>
                من غير رد: العميل راح
              </Badge>
            </div>
          </Card>
        </div>

        <SectionHeader
          title="المحادثات"
          hint="اضغط على أي صف تفتح المحادثة وترد — الصف الأصفر مستني أول رد منك"
        />
        <DataTable
          caption="جدول الاستفسارات"
          rows={rows}
          columns={columns}
          rowKey={(t) => t.id}
          onRowClick={openConversation}
          loading={leads.isLoading}
          error={leads.error ? errorMessage(leads.error) : undefined}
          onRetry={() => leads.refetch()}
          emptyTitle="مفيش استفسارات لسه"
          emptyHint="أول ما مشتري يسأل على عربية من عربياتك هتلاقي المحادثة هنا."
          emptyAction={
            <Button variant="outline" size="sm" icon={<MessageSquareDashed />} onClick={() => leads.refetch()}>
              حدّث
            </Button>
          }
          searchable
          searchPlaceholder="دوّر باسم المستفسر أو العربية…"
          exportName="carq-leads"
          rowTone={(t) => (t.firstResponseMinutes === null ? 'warn' : undefined)}
        />
      </Sheet>

      <ConversationDialog thread={openThread} onClose={() => setOpenThread(null)} />
    </>
  );
}

/* ═══════════════════════ المحادثة ═══════════════════════ */

/** فقاعة رسالة — رسايلي كحلي ناحية الشمال، والمشتري رمادي ناحية اليمين (عُرف الشات العربي) */
function Bubble({ msg }: { msg: ChatMessage }) {
  const mine = msg.from === 'exhibition';
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());
  // في RTL: justify-end = شمال الشاشة (نهاية سطر القراءة)
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-md px-3.5 py-2.5',
          mine ? 'bg-ink text-white' : 'bg-muted-soft text-content',
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sub">{msg.body}</p>
        <p className={cn('mt-1 text-caption', mine ? 'text-white/55' : 'text-content-faint')}>
          {mine ? 'إنت' : ''} {relTimeAr(msg.at, now)}
        </p>
      </div>
    </div>
  );
}

function ConversationDialog({
  thread,
  onClose,
}: {
  thread: ChatThread | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const messages = useLeadMessages(thread?.id ?? null);
  const send = useSendLeadMessage();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // آخر رسالة دايمًا قدام عينك — عند الفتح ومع كل رسالة جديدة
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data?.length, thread?.id]);

  useEffect(() => {
    if (!thread) setDraft('');
  }, [thread]);

  if (!thread) return null;

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(
      { threadId: thread.id, body },
      {
        onSuccess: () => setDraft(''),
        onError: (e) => toast({ tone: 'crit', title: 'الرسالة ماتبعتتش', body: errorMessage(e) }),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={thread.withName}
      subtitle={`${thread.listing.title} ${thread.listing.year} · ${maskPhone(thread.withPhone)}`}
      size="md"
      footer={
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="اكتب ردك…"
            aria-label="نص الرد"
            maxLength={1000}
            className="h-11 w-full flex-1 rounded-full border border-line bg-surface px-4 text-body text-content outline-none transition-colors placeholder:text-content-faint focus:border-accent"
          />
          <Button
            type="submit"
            icon={<SendHorizontal />}
            loading={send.isPending}
            disabled={!draft.trim()}
          >
            ابعت
          </Button>
        </form>
      }
    >
      {messages.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-3/4" />
          <Skeleton className="ms-auto h-14 w-2/3" />
          <Skeleton className="h-14 w-1/2" />
        </div>
      ) : messages.isError ? (
        <p className="py-6 text-center text-sub text-crit">{errorMessage(messages.error)}</p>
      ) : (
        <div ref={scrollRef} className="max-h-[46vh] space-y-3 overflow-y-auto pe-1">
          {(messages.data ?? []).map((msg) => (
            <Bubble key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
