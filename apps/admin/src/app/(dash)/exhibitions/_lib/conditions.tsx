'use client';

import { Check, Minus, X } from 'lucide-react';
import { cn } from '@carq/ui';
import type { ErrorCode } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * الشروط الثلاثة للمزايدة — ADMIN_DASHBOARD_SPEC §4.4 (A-1)
 *
 * السيرفر بيتحقق منهم واحد ورا التاني في
 * `services/auctions.py::_authorize_bidder`، وكل شرط بيفشل **بكود
 * مختلف**. عشان كده بنعرضهم ٣ علامات منفصلة — مش حالة واحدة:
 * الأدمن لازم يعرف أنهي شرط بالظبط اللي واقف قدام المعرض.
 * ════════════════════════════════════════════════════════════════
 */
export interface BidConditions {
  /** users.role == 'exhibition' — null يعني بيانات المستخدمين لسه بتحمّل */
  role: boolean | null;
  /** exhibitions.is_contracted — المفتاح اللي الأدمن بيقلبه */
  contracted: boolean;
  /** auction_entries.paid_at — null يعني مش مسجّل في أي مزاد شغال */
  entryPaid: boolean | null;
}

/** أول شرط ناقص هو اللي بيحدد الكود اللي المعرض هيشوفه لو حاول يزايد */
export function bidBlockCode(c: BidConditions): ErrorCode | null {
  if (c.role === false) return 'NOT_AN_EXHIBITION';
  if (!c.contracted) return 'NOT_CONTRACTED';
  if (c.entryPaid !== true) return 'ENTRY_NOT_PAID';
  return null;
}

/**
 * الرسالة بالعربي زي ما المعرض هيشوفها — مش كود خام.
 * الكود التقني موجود في tooltip للمطورين بس (قرار مالك المنتج:
 * ممنوع أكواد إنجليزي خام في أي واجهة).
 */
const BLOCK_LABEL: Record<string, string> = {
  NOT_AN_EXHIBITION: 'حسابك مش حساب معرض',
  NOT_CONTRACTED: 'معرضك مش متعاقد',
  ENTRY_NOT_PAID: 'رسوم دخول المزاد مش مدفوعة',
};

const BLOCK_HINT: Record<string, string> = {
  NOT_AN_EXHIBITION: 'دور المستخدم لسه مش «معرض»',
  NOT_CONTRACTED: 'المفتاح مقفول — التعاقد هو اللي بيفتح المزايدة',
  ENTRY_NOT_PAID: 'مدفعش رسوم دخول مزاد شغال',
};

function Mark({ state, label }: { state: boolean | null; label: string }) {
  const tone =
    state === true
      ? 'bg-ok-soft text-ok'
      : state === false
        ? 'bg-crit-soft text-crit'
        : 'bg-muted-soft text-content-faint';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-bold',
        tone,
      )}
    >
      {state === true ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : state === false ? (
        <X className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Minus className="h-3.5 w-3.5 shrink-0" />
      )}
      {label}
    </span>
  );
}

/** ٣ علامات في صف واحد + كود الخطأ اللي هيطلع لو الشرط ناقص */
export function ConditionMarks({ c, className }: { c: BidConditions; className?: string }) {
  const code = bidBlockCode(c);
  return (
    <div className={cn('min-w-[230px]', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Mark state={c.role} label="الدور exhibition" />
        <Mark state={c.contracted} label="متعاقد" />
        <Mark state={c.entryPaid} label="مدفوع للمزاد الحالي" />
      </div>
      {code ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption">
          <span className="text-content-faint">لو زايد دلوقتي هيشوف</span>
          <span className="rounded-xs bg-crit-soft px-1.5 py-0.5 font-bold text-crit" title={code}>
            «{BLOCK_LABEL[code] ?? 'المزايدة مقفولة'}»
          </span>
          <span className="text-content-sub">{BLOCK_HINT[code]}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-caption font-bold text-ok">الشروط الثلاثة كاملة — يقدر يزايد</p>
      )}
    </div>
  );
}
