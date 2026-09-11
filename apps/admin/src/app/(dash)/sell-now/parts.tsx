'use client';

import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Ban,
  BellRing,
  Car,
  Check,
  Copy,
  Hourglass,
  PackageCheck,
  Send,
  TimerOff,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  divergingColor,
  formatEGP,
  formatKm,
  formatPctPlain,
  maskPhone,
  useToast,
  withThousands,
  type Tone,
} from '@carq/ui';
import {
  errorMessage,
  useCollectSellNow,
  useOfferSellNow,
  useRevealPhone,
  type SellNowRequest,
  type SellNowStatus,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * قطع مشتركة بين طابور «بيع حالًا» وصفحة الطلب الواحد
 * (ADMIN_DASHBOARD_SPEC §4.2)
 *
 * الديالوج بتاع إصدار العرض هو **الأكشن الرئيسي في الداشبورد كلها**،
 * فمكتوب مرة واحدة هنا عشان الطابور وصفحة التفاصيل يشتغلوا بنفسه
 * بالظبط — نفس التحقق ونفس التحذير.
 * ════════════════════════════════════════════════════════════════
 */

/** نفس حدود OfferIn في الباك اند */
export const MIN_OFFER = 10_000;
export const MAX_OFFER = 100_000_000;

export const STATUS_META: Record<
  SellNowStatus,
  { label: string; tone: Tone; icon: ReactNode; meaning: string }
> = {
  pending: {
    label: 'مستني قرارك',
    tone: 'crit',
    icon: <Hourglass />,
    meaning: 'الطلب فوق ١٫٥ مليون، فالسيرفر وقف وسابلك القرار.',
  },
  offered: {
    label: 'عرض قايم',
    tone: 'accent',
    icon: <Send />,
    meaning: 'العرض راح للبائع وصلاحيته ٢٤ ساعة من وقت إصداره.',
  },
  accepted: {
    label: 'مقبول — محجوزة',
    tone: 'warn',
    icon: <Check />,
    meaning: 'البائع وافق، والعربية اتحجزت. لسه مش متباعة لحد ما تتستلم.',
  },
  collected: {
    label: 'تم الاستلام',
    tone: 'ok',
    icon: <PackageCheck />,
    meaning: 'العربية اتستلمت والإعلان بقى «متباعة».',
  },
  declined: {
    label: 'البائع رفض',
    tone: 'neutral',
    icon: <XCircle />,
    meaning: 'البائع شاف العرض ورفضه.',
  },
  expired: {
    label: 'العرض انتهى',
    tone: 'neutral',
    icon: <TimerOff />,
    meaning: 'الـ٢٤ ساعة عدّت من غير رد من البائع.',
  },
  cancelled: {
    label: 'البائع لغى',
    tone: 'neutral',
    icon: <Ban />,
    meaning: 'البائع سحب الطلب قبل ما يخلص.',
  },
};

export function StatusBadge({ status }: { status: SellNowStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

/** صورة العربية — `imageUrl` ممكن يكون null فالبديل أيقونة مش مربع فاضي */
export function CarThumb({
  url,
  alt,
  size = 44,
  height,
  className,
}: {
  url: string | null;
  alt: string;
  size?: number;
  height?: number;
  className?: string;
}) {
  const box = { width: size, height: height ?? size };
  if (!url) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-xs bg-muted-soft text-content-faint ${className ?? ''}`}
        style={box}
        title="الإعلان من غير صور"
      >
        <Car style={{ width: size * 0.42, height: size * 0.42 }} />
      </span>
    );
  }
  return (
    // صور محلية في public/cars — img عادي مش next/image
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={`shrink-0 rounded-xs object-cover ${className ?? ''}`}
      style={box}
    />
  );
}

/** التليفون مخفي جزئيًا (§10.2) وبيتنسخ كامل بضغطة */
export function PhoneCopy({
  phone,
  userId,
  className,
}: {
  phone: string;
  userId: string;
  className?: string;
}) {
  const toast = useToast();
  const reveal = useRevealPhone();
  const copy = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    try {
      // النسخ = كشف للرقم الكامل، فبيعدّي على نفس المسار المتسجّل (§10.2)
      // والرقم نفسه مابيظهرش في التنبيه — بيروح للحافظة بس
      const full = await reveal.mutateAsync({ userId });
      await navigator.clipboard.writeText(full);
      toast({ title: 'الرقم اتنسخ', body: 'الكشف اتسجّل في سجل التدقيق', tone: 'ok' });
    } catch (err) {
      toast({ title: 'مقدرناش ننسخ الرقم', body: errorMessage(err), tone: 'crit' });
    }
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="tnum text-caption text-content-sub">{maskPhone(phone)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="انسخ رقم البائع"
        title="انسخ الرقم كامل"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-muted-soft hover:text-content"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** لون الفرق: تيل = تحت الاقتراح · برتقالي = فوقه (نفس سلّم C-13) */
export function diffInk(diff: number): string {
  return divergingColor(Math.sign(diff), 1);
}

/** «أقل من الاقتراح بـ 45,000 ج.م — 3.1٪» */
export function diffSentence(offer: number, suggested: number): string {
  const diff = offer - suggested;
  if (diff === 0) return 'مطابق للاقتراح بالظبط';
  const pct = Math.abs((diff / suggested) * 100);
  const side = diff < 0 ? 'أقل من الاقتراح بـ' : 'أعلى من الاقتراح بـ';
  return `${side} ${withThousands(Math.abs(diff))} ج.م — ${formatPctPlain(pct)}`;
}

/* ═══════════════════════ ديالوج إصدار العرض ═══════════════════════ */

/**
 * الأكشن الرئيسي (§4.2). الاقتراح محطوط مسبقًا، والفرق بيتحسب لايف،
 * والتحذير بتاع الإشعارات ظاهر دايمًا — مش مخفي في tooltip.
 */
export function OfferDialog({
  request,
  open,
  onClose,
}: {
  request: SellNowRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const offer = useOfferSellNow();
  const toast = useToast();
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (open && request) {
      setRaw(String(request.suggestedPrice));
      offer.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);

  if (!request) return null;

  const digits = raw.replace(/[^\d]/g, '');
  const price = digits ? Number(digits) : NaN;
  const empty = digits.length === 0;
  const tooLow = !empty && price < MIN_OFFER;
  const tooHigh = !empty && price > MAX_OFFER;
  const valid = !empty && !tooLow && !tooHigh;

  const error = empty
    ? 'اكتب سعر العرض'
    : tooLow
      ? `أقل سعر مسموح بيه ${withThousands(MIN_OFFER)} ج.م`
      : tooHigh
        ? `أعلى سعر مسموح بيه ${withThousands(MAX_OFFER)} ج.م`
        : undefined;

  const diff = valid ? price - request.suggestedPrice : 0;

  const send = () => {
    if (!valid) return;
    offer.mutate(
      { id: request.id, price },
      {
        onSuccess: () => {
          toast({
            title: 'العرض اتبعت للبائع',
            body: `${formatEGP(price)} · صلاحيته ٢٤ ساعة`,
            tone: 'ok',
          });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="إصدار عرض بيع حالًا"
      subtitle="العرض بيروح للبائع على طول وصلاحيته ٢٤ ساعة"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={offer.isPending}>
            إلغاء
          </Button>
          <Button icon={<Send />} onClick={send} disabled={!valid} loading={offer.isPending}>
            ابعت العرض
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ───── العربية اللي بنسعّرها ───── */}
        <div className="flex gap-4 rounded-md border border-line bg-surface-alt p-4">
          <CarThumb url={request.listing.imageUrl} alt={request.listing.title} size={96} />
          <div className="min-w-0 flex-1">
            <p className="text-title text-content">
              {request.listing.title} {request.listing.year}
            </p>
            <p className="mt-0.5 text-caption text-content-sub">
              {formatKm(request.listing.km)} · {request.listing.governorate}
            </p>
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="text-sub text-content-sub">
                سعر الإعلان{' '}
                <span className="tnum font-bold text-content">
                  {formatEGP(request.listing.price)}
                </span>
              </span>
              <span className="text-sub text-content-sub">
                الاقتراح ٩١٪{' '}
                <span className="tnum font-bold text-accent">
                  {formatEGP(request.suggestedPrice)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ───── السعر ───── */}
        <Field
          label="سعر العرض"
          required
          error={error}
          hint={`المسموح من ${withThousands(MIN_OFFER)} لـ ${withThousands(MAX_OFFER)} ج.م`}
        >
          <div className="relative">
            <Input
              inputMode="numeric"
              value={digits ? withThousands(price) : raw}
              onChange={(e) => setRaw(e.target.value)}
              invalid={Boolean(error)}
              className="tnum pe-14 text-title"
              aria-label="سعر العرض بالجنيه"
            />
            <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sub text-content-faint">
              ج.م
            </span>
          </div>
        </Field>

        {/* ───── الفرق عن الاقتراح — لايف ───── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
          <span className="text-sub text-content-sub">الفرق عن الاقتراح</span>
          {!valid ? (
            <span className="text-sub text-content-faint">—</span>
          ) : diff === 0 ? (
            <span className="text-sub font-bold text-content-sub">مطابق للاقتراح بالظبط</span>
          ) : (
            <span className="tnum text-title font-extrabold" style={{ color: diffInk(diff) }}>
              {diffSentence(price, request.suggestedPrice)}
            </span>
          )}
        </div>

        {/* ───── التحذير الإجباري ───── */}
        <Banner tone="warn" title="البائع مش هيتنبّه على تليفونه" icon={<BellRing />}>
          العرض بيوصله كإشعار <strong className="font-extrabold">جوه التطبيق بس</strong> —
          الإشعارات الخارجية (push) لسه مش متركّبة في تطبيق الموبايل. يعني ممكن مايعرفش بالعرض
          غير لما يفتح التطبيق بنفسه، والـ٢٤ ساعة بتعدّي عليه. لو الطلب مهم، كلّمه على تليفونه
          بعد ما تبعت.
        </Banner>

        {offer.isError ? (
          <Banner tone="crit" title={errorMessage(offer.error)} icon={<AlertTriangle />} />
        ) : null}
      </div>
    </Dialog>
  );
}

/* ═══════════════════════ تأكيد الاستلام ═══════════════════════ */

/**
 * `accepted` = محجوزة · `collected` = متباعة (SN-7).
 * الخلط بين الاتنين بيخلي عربية اتلغى استلامها «متباعة» للأبد —
 * فالتأكيد هنا بيشرح الأثر بالظبط قبل ما يتضغط.
 */
export function CollectDialog({
  request,
  open,
  onClose,
}: {
  request: SellNowRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const collect = useCollectSellNow();
  const toast = useToast();

  useEffect(() => {
    if (open) collect.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);

  if (!request) return null;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="تأكيد استلام العربية"
      impact="التأكيد ده بيحوّل الإعلان لـ«متباعة» نهائيًا ويقفل الطلب. اعملها بعد ما تستلم العربية فعلًا وتتحرك الفلوس — قبل كده سيبها «مقبولة»، يعني محجوزة بس."
      confirmLabel="أكّد الاستلام"
      tone="accent"
      requireReason={false}
      loading={collect.isPending}
      onConfirm={() =>
        collect.mutate(
          { id: request.id },
          {
            onSuccess: () => {
              toast({
                title: 'الاستلام اتسجّل',
                body: `${request.listing.title} بقت متباعة`,
                tone: 'ok',
              });
              onClose();
            },
          },
        )
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-md border border-line bg-surface-alt p-3">
          <CarThumb url={request.listing.imageUrl} alt={request.listing.title} size={52} />
          <div className="min-w-0">
            <p className="truncate text-sub font-bold text-content">
              {request.listing.title} {request.listing.year}
            </p>
            <p className="tnum mt-0.5 text-caption text-content-sub">
              العرض المقبول {request.offerPrice !== null ? formatEGP(request.offerPrice) : '—'}
            </p>
          </div>
        </div>
        {collect.isError ? (
          <Banner tone="crit" title={errorMessage(collect.error)} icon={<AlertTriangle />} />
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
