'use client';

import { useState } from 'react';
import { Banknote, Info, Landmark, Smartphone, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  FileDrop,
  SegmentedControl,
  formatEGP,
  useToast,
} from '@carq/ui';
import type { AuctionEntry } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * زرار دفع رسوم دخول المزاد — **نقطة التبديل الوحيدة**
 *
 * دلوقتي: تحويل بنكي أو انستاباي + رفع إيصال، والأدمن بيأكد بإيده
 * (`POST /v1/admin/auction-entries/{id}/paid`).
 *
 * لما بوابة الدفع (Paymob/Fawry) تتركّب، اللي بيتغيّر هو **جوه المكوّن
 * ده بس**: بدل الديالوج، نداء واحد بيفتح صفحة البوابة ويرجّع بالنتيجة.
 * ولا شاشة تانية في البوابة بتتغير — عشان كده الزرار معزول هنا
 * (EXHIBITION_PORTAL_SPEC §4.6).
 * ════════════════════════════════════════════════════════════════
 */

type Method = 'bank' | 'instapay';

const METHODS: Array<{ value: Method; label: string }> = [
  { value: 'bank', label: 'تحويل بنكي' },
  { value: 'instapay', label: 'انستاباي' },
];

export function PayEntryButton({
  entry,
  size = 'sm',
  variant = 'primary',
  label = 'حوّل الرسوم وابعت الإيصال',
}: {
  entry: AuctionEntry;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'outline';
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>('bank');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = () => {
    setSending(true);
    // الرفع الحقيقي: POST /v1/auctions/{id}/entry/receipt — لسه مطلوب في الباك (§8.2)
    window.setTimeout(() => {
      setSending(false);
      setOpen(false);
      setReceipt(null);
      toast({
        title: 'الإيصال وصلنا',
        body: 'دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل.',
        tone: 'ok',
      });
    }, 700);
  };

  return (
    <>
      <Button size={size} variant={variant} icon={<Banknote />} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="حوّل رسوم الدخول"
        subtitle={entry.auctionListingTitle}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              إلغاء
            </Button>
            <Button onClick={submit} loading={sending} disabled={!receipt} icon={<Upload />}>
              ابعت الإيصال
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-warn/25 bg-warn-soft px-4 py-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <p className="text-sub text-warn">
              دخولك هيتفعّل بعد تأكيد التحويل — عادة خلال ساعة عمل. لحد ما التأكيد يحصل، المزايدة
              في المزاد ده مقفولة، ومفيش حاجة بتتقال إنها «مدفوعة».
            </p>
          </div>

          <div>
            <p className="mb-2 text-sub font-bold text-content">طريقة التحويل</p>
            <SegmentedControl options={METHODS} value={method} onChange={setMethod} />
          </div>

          <div className="rounded-md border border-line bg-surface-alt px-4 py-4">
            <p className="flex items-center gap-2 text-sub font-bold text-content">
              {method === 'bank' ? (
                <Landmark className="h-4 w-4 text-content-sub" />
              ) : (
                <Smartphone className="h-4 w-4 text-content-sub" />
              )}
              {method === 'bank' ? 'بيانات الحساب البنكي' : 'حساب انستاباي'}
            </p>
            <p className="mt-2 text-sub text-content-sub">
              البيانات لسه ماتحددتش — رسوم دخول المزاد قرار تجاري مفتوح لحد دلوقتي. أول ما يتقرر،
              الحساب والمبلغ هيظهروا هنا وهيتبعتوا كمان على تليفون المعرض.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="neutral" icon={<Banknote />}>
                المبلغ المسجّل: {entry.fee > 0 ? formatEGP(entry.fee) : 'صفر لحد ما الرسوم تتحدد'}
              </Badge>
            </div>
          </div>

          <FileDrop
            label="ارفع صورة إيصال التحويل"
            hint="صورة أو PDF — بتروح للأدمن للمراجعة"
            fileName={receipt}
            onPick={(f) => setReceipt(f.name)}
            icon={<Upload />}
          />

          <p className="text-caption text-content-faint">
            الرفع هنا بيسجّل الإيصال على الدخول. تأكيد الدفع نفسه قرار بشري من الأدمن —
            مفيش بوابة دفع متركّبة لسه.
          </p>
        </div>
      </Dialog>
    </>
  );
}
