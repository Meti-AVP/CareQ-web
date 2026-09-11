'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { palette } from '../tokens';
import { StrokeMotif, type MotifKind } from './StrokeMotif';

/**
 * ════════════════════════════════════════════════════════════════
 * نمط «الرأس الملوّن + الشيت الأبيض» — توقيع CarQ البصري
 *
 * منقول من `src/components/ui/HeaderSheet.tsx` في الموبايل:
 * رأس كحلي بياخد أعلى الصفحة وفيه خط مرسوم بيترسم مع الدخول،
 * وتحته المحتوى في شيت أبيض بحواف علوية مستديرة **بيغطي طرف الرأس**
 * (SHEET_OVERLAP = 26) — فبيدي إحساس الطبقات والعمق.
 *
 * ملاحظة RTL: إحنا في `<html dir="rtl">` — المتصفح بيعكس التخطيط لوحده.
 * ممنوع row-reverse يدوي (دي قاعدة React Native، مالهاش لازمة هنا).
 * ════════════════════════════════════════════════════════════════
 */

export function PageHeader({
  title,
  subtitle,
  motif = 'circle',
  motifSize = 210,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** لكل شاشة خطها — 'none' لو الصفحة ليها حركة بطلة تانية */
  motif?: MotifKind | 'none';
  motifSize?: number;
  actions?: ReactNode;
  /** عناصر بتقعد جوه الرأس نفسه (فلاتر، تبويبات) */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'relative overflow-hidden bg-ink px-6 pt-7 text-white',
        // padding سفلي بيسيب مكان لتغطية الشيت
        'pb-[46px]',
        className,
      )}
    >
      {motif !== 'none' ? (
        <StrokeMotif
          kind={motif}
          size={motifSize}
          color={palette.accent}
          strokeWidth={7}
          opacity={0.55}
          delay={220}
          duration={1500}
          className="absolute -top-8 start-[-52px] z-0"
        />
      ) : null}

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 animate-rise">
            <h1 className="text-h1 text-white">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sub text-white/70">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </header>
  );
}

/** الشيت الأبيض اللي بيغطي طرف الرأس */
export function Sheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sheet-overlap relative z-10 min-h-[60vh] animate-sheet bg-canvas px-6 pb-16 pt-7',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** عنوان قسم جوه الشيت + أكشن اختياري على الجنب */
export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 text-content">{title}</h2>
        {hint ? <p className="mt-0.5 text-caption text-content-sub">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
