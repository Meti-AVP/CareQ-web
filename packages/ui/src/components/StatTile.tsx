'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatPct, withThousands } from '../lib/format';
import { Ticker } from './Ticker';
import type { Tone } from './Primitives';

/**
 * بلاطة KPI: رقم كبير + دلتا عن الفترة السابقة + sparkline صغير.
 * (ADMIN_DASHBOARD_SPEC §4.1)
 *
 * قاعدة: **رقم واحد ⇒ مش رسم** (C-24). البلاطة دي هي الشكل الصح
 * للرقم المفرد، والـsparkline سياق مش رسم مستقل.
 */

function Sparkline({ points, tone }: { points: number[]; tone: Tone }) {
  if (points.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(' ');

  const stroke =
    tone === 'crit'
      ? 'var(--crit)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'ok'
          ? 'var(--ok)'
          : tone === 'accent'
            ? 'var(--accent)'
            : 'var(--text-faint)';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" className="shrink-0">
      <path d={d} stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  previous,
  spark,
  tone = 'neutral',
  hint,
  icon,
  href,
  /** «مستنية قرارك» وأمثالها: لو > 0 البلاطة بتبقى حمرا (§4.1) */
  alertWhenPositive = false,
  format = withThousands,
  suffix,
  /** وانت مستني الداتا: سكيلتون مش صفر — الصفر بيتقري «فاضي» وده كدب */
  loading = false,
  onClick,
  className,
}: {
  label: string;
  value: number;
  previous?: number;
  spark?: number[];
  tone?: Tone;
  hint?: string;
  icon?: ReactNode;
  href?: string;
  alertWhenPositive?: boolean;
  format?: (n: number) => string;
  suffix?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const effectiveTone: Tone = alertWhenPositive && value > 0 ? 'crit' : tone;
  const delta =
    previous !== undefined && previous !== 0 ? ((value - previous) / previous) * 100 : undefined;

  const accentBorder =
    effectiveTone === 'crit'
      ? 'border-crit/30'
      : effectiveTone === 'warn'
        ? 'border-warn/30'
        : effectiveTone === 'ok'
          ? 'border-ok/30'
          : effectiveTone === 'accent'
            ? 'border-accent/30'
            : 'border-line';

  const valueColor =
    effectiveTone === 'crit'
      ? 'text-crit'
      : effectiveTone === 'warn'
        ? 'text-warn'
        : effectiveTone === 'ok'
          ? 'text-ok'
          : 'text-content';

  const Tag = (href ? 'a' : onClick ? 'button' : 'div') as 'a';

  return (
    <Tag
      href={href}
      onClick={onClick}
      className={cn(
        'group relative block overflow-hidden rounded-lg border bg-surface p-4 text-start shadow-card transition-all',
        accentBorder,
        (href || onClick) && 'hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption text-content-sub">{label}</span>
        {icon ? (
          <span className="shrink-0 text-content-faint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-sm bg-muted-soft" aria-hidden="true" />
          ) : (
            <div className={cn('text-h1 leading-none', valueColor)}>
              <Ticker value={value} format={format} />
              {suffix ? <span className="text-h2 opacity-70"> {suffix}</span> : null}
            </div>
          )}

          {loading ? null : delta !== undefined ? (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-caption font-bold',
                delta > 0 ? 'text-ok' : delta < 0 ? 'text-crit' : 'text-content-sub',
              )}
            >
              {delta > 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : delta < 0 ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
              {formatPct(delta)}
              <span className="font-medium text-content-faint">عن الفترة السابقة</span>
            </div>
          ) : hint ? (
            <p className="mt-2 text-caption text-content-faint">{hint}</p>
          ) : null}
        </div>

        {!loading && spark && spark.length > 1 ? (
          <Sparkline points={spark} tone={effectiveTone} />
        ) : null}
      </div>
    </Tag>
  );
}
