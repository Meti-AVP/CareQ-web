'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../lib/cn';

/* ═══════════════════════ الأسطح ═══════════════════════ */

/** كارت أبيض بحافة شعرة وظل ناعم — السطح الأساسي في كل الشاشات */
export function Card({
  children,
  className,
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-lg border border-line bg-surface shadow-card',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** كارت كحلي — للبلاطات اللي المفروض تاخد الانتباه */
export function InkCard({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-ink text-white shadow-float',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════ الشارات ═══════════════════════ */

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit' | 'ink';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted-soft text-content-sub',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  ink: 'bg-ink text-white',
};

/**
 * شارة حالة. قاعدة إلزامية (ADMIN_DASHBOARD_SPEC §7):
 * لون الحالة عمره ما ييجي لوحده — دايمًا **مع أيقونة ونص**.
 */
export function Badge({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-bold',
        toneClasses[tone],
        className,
      )}
    >
      {icon ? <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : null}
      {children}
    </span>
  );
}

/** شيب محايد للفلاتر والوسوم */
export function Pill({
  children,
  active,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sub font-bold transition-colors',
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-surface text-content-sub hover:border-line-strong hover:text-content',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/* ═══════════════════════ حالات فاضية وتحميل ═══════════════════════ */

/**
 * الحالة الفاضية. مهمة جدًا هنا: **قاعدة البيانات فاضية يوم الإطلاق**
 * (ADMIN_DASHBOARD_SPEC §11) — ده مش استثناء نادر، ده أول ما هتشوفه.
 * ممنوع سبينر أبدي أو رسم فاضي.
 */
export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        {icon ?? <Info className="h-6 w-6" />}
      </div>
      <p className="text-title text-content">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-sub text-content-sub">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** شيمر تحميل — نفس Shimmer في الموبايل */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div style={style} className={cn('animate-shimmer rounded-xs bg-line', className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-9 flex-1', c === 0 && 'max-w-[52px]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** حالة الخطأ — بتعرض رسالة السيرفر زي ما هي (X-4) */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-crit-soft text-crit">
        <Info className="h-5 w-5" />
      </div>
      <p className="max-w-md text-body text-content">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-line-strong px-4 py-2 text-sub font-bold text-content hover:bg-surface-alt"
        >
          حاول تاني
        </button>
      ) : null}
    </div>
  );
}

/* ═══════════════════════ لمسات الحركة ═══════════════════════ */

/** نقطة «مباشر» نابضة — PulseDot في الموبايل */
export function PulseDot({ className, tone = 'crit' }: { className?: string; tone?: 'crit' | 'ok' | 'accent' }) {
  const color = tone === 'ok' ? 'bg-ok' : tone === 'accent' ? 'bg-accent' : 'bg-crit';
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      <span className={cn('absolute inset-0 animate-halo rounded-full', color)} />
      <span className={cn('relative h-2 w-2 rounded-full', color)} />
    </span>
  );
}

/** لمعة بتعدّي مرة واحدة على السطح — Shine في الموبايل */
export function Shine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-0 -inset-x-10 animate-shine bg-gradient-to-l from-transparent via-white/15 to-transparent',
        className,
      )}
    />
  );
}

/** أفاتار حروف — مفيش صور أشخاص، زي Monogram في الموبايل */
export function Monogram({
  text,
  size = 36,
  dark,
  className,
}: {
  text: string;
  size?: number;
  dark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold',
        dark ? 'bg-ink text-white' : 'bg-accent-soft text-accent',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {text}
    </span>
  );
}

/** بانر تحذير/معلومة عريض — للحالات اللي لازم تتشرح مش تتخفي */
export function Banner({
  tone = 'warn',
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const border =
    tone === 'crit'
      ? 'border-crit/25'
      : tone === 'ok'
        ? 'border-ok/25'
        : tone === 'accent'
          ? 'border-accent/25'
          : 'border-warn/25';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-3.5',
        toneClasses[tone],
        border,
        className,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-title">{title}</p>
        {children ? <div className="mt-1 text-sub opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
