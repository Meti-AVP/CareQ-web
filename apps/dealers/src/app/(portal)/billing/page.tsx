'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Gavel,
  HelpCircle,
  Hourglass,
  Plus,
  Receipt,
  Trophy,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  PageHeader,
  SectionHeader,
  SegmentedControl,
  Select,
  Sheet,
  StatTile,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  useToast,
  waitingFor,
  withThousands,
  type Column,
} from '@carq/ui';
import {
  errorMessage,
  nowMs,
  useCreateEntry,
  useDealerAuctions,
  useExhibitionStats,
  useMyEntries,
  useMyExhibition,
} from '@carq/api-client';
import type { AuctionEntry } from '@carq/api-client';
import { PayEntryButton } from '@/components/PayEntryButton';

/**
 * ════════════════════════════════════════════════════════════════
 * `/billing` — رسوم دخول المزادات (EXHIBITION_PORTAL_SPEC §4.6)
 *
 * `POST /v1/auctions/{id}/entry` **بيسجّل التزام — مابيحصّلش فلوس.**
 * الأدمن هو اللي بيأكد التحويل ويملا `paid_at`، وساعتها بس المزايدة
 * بتتفتح (الشرط ٣ من ٣ في A-1).
 *
 * القاعدة الحاكمة في الشاشة دي: **متقولش «تم الدفع»** وإحنا مستنيين
 * تأكيد بشري. اللي بيتقال: «مستني تأكيد التحويل».
 * ════════════════════════════════════════════════════════════════
 */

type Filter = 'all' | 'pending' | 'paid';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'مستني التأكيد' },
  { value: 'paid', label: 'متفعّل' },
];

export default function BillingPage() {
  const toast = useToast();
  const entries = useMyEntries();
  const exhibition = useMyExhibition();
  const liveAuctions = useDealerAuctions('live');
  const stats = useExhibitionStats();
  const createEntry = useCreateEntry();
  /** FND-036 — ثابتة على ساعة الموك المجمّدة، مش الوقت الحقيقي. */
  const now = new Date(nowMs());

  const [filter, setFilter] = useState<Filter>('all');
  const [pickedAuction, setPickedAuction] = useState('');

  const all = useMemo(() => entries.data ?? [], [entries.data]);
  const pending = all.filter((e) => e.paidAt === null);
  const paid = all.filter((e) => e.paidAt !== null);
  const feesTotal = all.reduce((s, e) => s + e.fee, 0);
  /** D-13: الرسوم المدفوعة فعلًا مقابل المكاسب — بلاطتين جنب بعض */
  const paidFeesTotal = paid.reduce((s, e) => s + e.fee, 0);

  const rows = filter === 'pending' ? pending : filter === 'paid' ? paid : all;

  const notEntered = useMemo(
    () => (liveAuctions.data ?? []).filter((a) => a.myEntry === null),
    [liveAuctions.data],
  );

  const register = async () => {
    if (!pickedAuction) return;
    try {
      await createEntry.mutateAsync({ auctionId: pickedAuction });
      setPickedAuction('');
      toast({
        title: 'دخولك اتسجّل',
        body: 'الخطوة الجاية: حوّل الرسوم وابعت الإيصال — الدخول بيتفعّل بعد التأكيد.',
        tone: 'ok',
      });
    } catch (e) {
      toast({ title: 'مقدرناش نسجّل الدخول', body: errorMessage(e), tone: 'crit' });
    }
  };

  const columns: Array<Column<AuctionEntry>> = [
    {
      key: 'auction',
      header: 'المزاد',
      value: (e) => e.auctionListingTitle,
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate text-sub font-bold text-content">{e.auctionListingTitle}</p>
          <p className="text-caption text-content-faint">دخول رقم {e.id}</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاريخ التسجيل',
      width: 170,
      sortable: true,
      value: (e) => -new Date(e.createdAt).getTime(),
      render: (e) => (
        <div>
          <p className="tnum text-sub text-content">{formatDateAr(e.createdAt)}</p>
          {e.paidAt === null ? (
            <p className="text-caption text-content-faint">مستني من {waitingFor(e.createdAt, now)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'fee',
      header: 'الرسوم',
      width: 190,
      align: 'start',
      sortable: true,
      value: (e) => e.fee,
      render: (e) =>
        e.fee > 0 ? (
          <span className="tnum text-sub font-bold text-content">{formatEGP(e.fee)}</span>
        ) : (
          <Badge tone="neutral" icon={<HelpCircle />}>
            لسه ماتحددتش
          </Badge>
        ),
    },
    {
      key: 'status',
      header: 'الحالة',
      width: 230,
      value: (e) => (e.paidAt ? 'متفعّل' : 'مستني تأكيد التحويل'),
      render: (e) =>
        e.paidAt ? (
          <div>
            <Badge tone="ok" icon={<CheckCircle2 />}>
              الدخول متفعّل
            </Badge>
            <p className="tnum mt-1 text-caption text-content-faint">
              اتأكد {formatDateTimeAr(e.paidAt)}
            </p>
          </div>
        ) : (
          <div>
            <Badge tone="warn" icon={<Hourglass />}>
              مستني تأكيد التحويل
            </Badge>
            <p className="mt-1 text-caption text-content-faint">عادة خلال ساعة عمل</p>
          </div>
        ),
    },
    {
      key: 'action',
      header: '',
      width: 230,
      align: 'end',
      value: () => '',
      render: (e) =>
        e.paidAt ? (
          <Link href={`/auctions/${e.auctionId}`}>
            <Button variant="outline" size="sm" icon={<Gavel />}>
              ادخل المزاد
            </Button>
          </Link>
        ) : (
          <PayEntryButton entry={e} />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الرسوم والفواتير"
        subtitle="رسوم دخول المزادات — كل دخول وحالته الحقيقية"
        motif="oval"
        actions={
          <Link href="/auctions">
            <Button variant="white" size="sm" icon={<Gavel />}>
              المزادات المتاحة
            </Button>
          </Link>
        }
      />

      <Sheet>
        {/* ───── القرارين التجاريين المفتوحين — مكتوبين صراحة مش مخبّيين ───── */}
        <Banner
          tone="warn"
          icon={<AlertTriangle />}
          title="قرارين تجاريين لسه مفتوحين — الشاشة دي مبنية عليهم"
          className="mb-6 animate-rise"
        >
          <ol className="mt-1 list-inside list-decimal space-y-1">
            <li>
              رسوم الدخول في عمود auction_entries.fee دلوقتي دايمًا صفر. الرسوم كام؟ مبلغ ثابت لكل
              مزاد، ولا نسبة من سعر البداية، ولا اشتراك شهري؟
            </li>
            <li>
              مفيش بوابة دفع حقيقية (زي Paymob أو Fawry) متركّبة في المشروع. التحصيل دلوقتي يدوي
              بالتحويل والإيصال، والأدمن بيأكد بإيده.
            </li>
          </ol>
        </Banner>

        <SectionHeader title="الأرقام الأساسية" />
        <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="مزادات داخلها"
            value={all.length}
            icon={<Gavel />}
            hint="كل دخول مسجّل — مدفوع أو مستني"
            loading={entries.isLoading}
          />
          <StatTile
            label="مستني تأكيد التحويل"
            value={pending.length}
            icon={<Hourglass />}
            alertWhenPositive
            hint="المزايدة في المزادات دي مقفولة لحد التأكيد"
            loading={entries.isLoading}
          />
          <StatTile
            label="دخول متفعّل"
            value={paid.length}
            icon={<CheckCircle2 />}
            tone="ok"
            hint="الشرط التالت من شروط المزايدة اتحقق فيها"
            loading={entries.isLoading}
          />
          <StatTile
            label="إجمالي الرسوم المسجّلة"
            value={feesTotal}
            icon={<Banknote />}
            format={(n) => (n > 0 ? formatEGP(n) : 'صفر')}
            hint="بيفضل صفر لحد ما سياسة الرسوم تتقرر"
            loading={entries.isLoading}
          />
        </div>

        {/* ───── D-13: رسوم مدفوعة مقابل مكاسب — بلاطتين (قسم ٧) ───── */}
        <SectionHeader
          title="اللي دفعته مقابل اللي كسبته"
          hint="الرسوم المؤكّدة فعلًا جنب عدد المزادات اللي كسبتها — عشان تشوف الدفع بيرجع بإيه"
        />
        <div className="mb-9 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            label="رسوم مدفوعة ومؤكّدة"
            value={paidFeesTotal}
            icon={<Banknote />}
            format={(n) => (n > 0 ? formatEGP(n) : 'صفر')}
            hint={`من ${withThousands(paid.length)} دخول متفعّل`}
            loading={entries.isLoading}
          />
          <StatTile
            label="مزادات كسبتها (٣٠ يوم)"
            value={stats.data?.wins30d ?? 0}
            icon={<Trophy />}
            tone="ok"
            href="/auctions/mine"
            loading={stats.isLoading}
          />
        </div>

        {/* ───── الأمانة: اللي بيحصل بالظبط ───── */}
        <Card className="mb-6 border-accent/25 bg-accent-soft/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-accent">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-title text-content">إزاي الدخول بيتفعّل</p>
              <ol className="mt-2 space-y-1.5 text-sub text-content-sub">
                <li>١. تسجّل دخولك في المزاد — ده التزام، مش دفع.</li>
                <li>٢. تحوّل الرسوم (تحويل بنكي أو انستاباي) وترفع الإيصال.</li>
                <li>٣. الأدمن يراجع الإيصال ويأكّد التحويل.</li>
                <li>
                  ٤. ساعتها بس الدخول بيبقى متفعّل والمزايدة بتتفتح لك في المزاد ده.
                </li>
              </ol>
              <p className="mt-3 text-sub font-bold text-content">
                دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل.
              </p>
            </div>
          </div>
        </Card>

        {/* ───── تسجيل دخول جديد ───── */}
        <Card className="mb-6">
          <SectionHeader
            title="سجّل دخول في مزاد"
            hint="اختصار من هنا — أو من صفحة المزادات المتاحة"
          />
          {exhibition.data && !exhibition.data.isContracted ? (
            <Banner
              tone="accent"
              icon={<AlertTriangle />}
              title="معرضك مش متعاقد — المزايدة مقفولة حتى بعد الدفع"
              className="mb-4"
              action={
                <Link href="/contract">
                  <Button variant="primary" size="sm">
                    اعرف التفاصيل
                  </Button>
                </Link>
              }
            >
              التعاقد شرط منفصل عن الدفع. تقدر تسجّل وتحوّل، بس المزايدة مش هتتفتح غير لما العقد
              يبقى ساري.
            </Banner>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <label className="mb-1.5 block text-sub font-bold text-content">
                المزادات الشغالة اللي مش داخلها
              </label>
              <Select
                value={pickedAuction}
                onChange={(e) => setPickedAuction(e.target.value)}
                disabled={liveAuctions.isLoading || notEntered.length === 0}
              >
                <option value="">
                  {liveAuctions.isLoading
                    ? 'بنحمّل المزادات…'
                    : notEntered.length === 0
                      ? 'إنت مسجّل في كل المزادات الشغالة'
                      : 'اختار مزاد'}
                </option>
                {notEntered.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.listing.title} {a.listing.year} · يبدأ من {formatEGP(a.startPrice)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              icon={<Plus />}
              onClick={register}
              loading={createEntry.isPending}
              disabled={!pickedAuction}
            >
              سجّل دخولي
            </Button>
          </div>
          {liveAuctions.error ? (
            <p className="mt-3 text-sub font-bold text-crit">{errorMessage(liveAuctions.error)}</p>
          ) : (
            <p className="mt-3 text-caption text-content-faint">
              التسجيل بيلزمك برسوم المزاد لما تتحدد. مابيتحصّلش منك حاجة دلوقتي.
            </p>
          )}
        </Card>

        {/* ───── جدول الدخول ───── */}
        <SectionHeader
          title="دخول المزادات"
          hint="الحالة هنا هي حالة السيرفر — مش تخمين"
          action={
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} size="sm" />
          }
        />
        <DataTable
          caption="جدول رسوم دخول المزادات"
          rows={rows}
          columns={columns}
          rowKey={(e) => e.id}
          loading={entries.isLoading}
          error={entries.error ? errorMessage(entries.error) : undefined}
          onRetry={() => entries.refetch()}
          emptyTitle={filter === 'paid' ? 'مفيش دخول متفعّل' : 'مفيش دخول مسجّل'}
          emptyHint={
            filter === 'paid'
              ? 'أول ما الأدمن يأكّد تحويل، الدخول بيظهر هنا متفعّل.'
              : 'سجّل دخولك في مزاد شغال من فوق أو من صفحة المزادات.'
          }
          emptyAction={
            <Link href="/auctions">
              <Button variant="outline" size="sm" icon={<Gavel />}>
                شوف المزادات
              </Button>
            </Link>
          }
          exportName="carq-entries"
          rowTone={(e) => (e.paidAt === null ? 'warn' : undefined)}
        />

        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-title text-content">لما بوابة الدفع تتركّب</p>
              <p className="mt-1 text-sub text-content-sub">
                زرار الدفع معزول في مكوّن واحد. إضافة Paymob أو Fawry بعدين معناها استبدال خطوة
                واحدة — الجدول والحالات والأرقام كلها بتفضل زي ما هي.
              </p>
            </div>
            <Badge tone="neutral" icon={<CreditCard />}>
              خطوة واحدة للاستبدال
            </Badge>
          </div>
        </Card>
      </Sheet>
    </>
  );
}
