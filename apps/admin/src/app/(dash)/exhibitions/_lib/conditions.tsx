'use client';

import { Check, Minus, X } from 'lucide-react';
import { cn } from '@carq/ui';
import {
  bidBlockCode,
  BID_BLOCK_LABEL_AR as BLOCK_LABEL,
  BID_BLOCK_HINT_AR as BLOCK_HINT,
  type BidConditions,
} from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * عرض الشروط الثلاثة للمزايدة — ADMIN_DASHBOARD_SPEC §4.4 (A-1)
 *
 * المنطق نفسه (`bidBlockCode`, `BidConditions`) مركزي في
 * `@carq/api-client` (`permissions.ts`، المرحلة ٣) — مستخدم كمان في
 * بوابة المعارض لحساب أهلية المزايدة. الملف ده UI العرض بس: السيرفر
 * بيتحقق منهم واحد ورا التاني في
 * `services/auctions.py::_authorize_bidder`، وكل شرط بيفشل **بكود
 * مختلف**. عشان كده بنعرضهم ٣ علامات منفصلة — مش حالة واحدة: الأدمن
 * لازم يعرف أنهي شرط بالظبط اللي واقف قدام المعرض.
 * ════════════════════════════════════════════════════════════════
 */
export type { BidConditions };
export { bidBlockCode };

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
