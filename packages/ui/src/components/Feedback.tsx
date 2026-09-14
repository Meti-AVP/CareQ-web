'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatCountdown } from '../lib/format';
import { secondsUntil } from '../lib/date';
import { Button } from './Button';

/* ═══════════════════════ التبويبات ═══════════════════════ */

export interface TabDef {
  key: string;
  label: string;
  /** عدّاد جنب اسم التبويب — أحمر لو الرقم محتاج قرار */
  count?: number;
  alert?: boolean;
}

/** تبويبات — بتشتغل على رأس كحلي أو على سطح فاتح */
export function Tabs({
  tabs,
  value,
  onChange,
  onDark = false,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex flex-wrap items-center gap-1 overflow-x-auto',
        onDark ? '' : 'border-b border-line',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative inline-flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sub font-bold transition-colors',
              onDark
                ? active
                  ? 'rounded-full bg-white text-ink'
                  : 'rounded-full text-white/70 hover:bg-white/10 hover:text-white'
                : active
                  ? 'text-accent after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                  : 'text-content-sub hover:text-content',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 ? (
              <span
                className={cn(
                  'tnum inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold',
                  t.alert
                    ? 'bg-crit text-white'
                    : active && onDark
                      ? 'bg-ink/10 text-ink'
                      : onDark
                        ? 'bg-white/15 text-white'
                        : 'bg-muted-soft text-content-sub',
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ العداد التنازلي ═══════════════════════ */

/**
 * عداد بيتحسب **من `endsAt` بتاع السيرفر في كل تكة** (A-6) —
 * مش رقم بينقص محليًا. لو السيرفر مدّ المزاد، العداد بيتبع تلقائي.
 */
export function Countdown({
  endsAt,
  onEnd,
  className,
  size = 'md',
  /** بيبقى أحمر لما الوقت يقل عن العتبة (بالثواني) */
  urgentBelow = 120,
}: {
  endsAt: string | number | Date;
  onEnd?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  urgentBelow?: number;
}) {
  const [left, setLeft] = useState(() => secondsUntil(endsAt));

  useEffect(() => {
    setLeft(secondsUntil(endsAt));
    const id = setInterval(() => {
      const next = secondsUntil(endsAt);
      setLeft(next);
      if (next <= 0) {
        clearInterval(id);
        onEnd?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt, onEnd]);

  const urgent = left > 0 && left <= urgentBelow;
  const sizes = { sm: 'text-sub', md: 'text-title', lg: 'text-display leading-none' };

  return (
    <span
      className={cn(
        'tnum font-extrabold tabular-nums',
        sizes[size],
        left <= 0 ? 'text-content-faint' : urgent ? 'animate-pulse text-crit' : 'text-content',
        className,
      )}
    >
      {left <= 0 ? 'انتهى' : formatCountdown(left)}
    </span>
  );
}

/* ═══════════════════════ التنبيهات ═══════════════════════ */

type ToastTone = 'ok' | 'crit' | 'info';
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
}

const ToastCtx = createContext<{
  toast: (t: { title: string; body?: string; tone?: ToastTone }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((t: { title: string; body?: string; tone?: ToastTone }) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, title: t.title, body: t.body, tone: t.tone ?? 'info' }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 start-5 z-[60] flex w-[min(360px,calc(100vw-40px))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex animate-rise items-start gap-3 rounded-md border bg-surface px-4 py-3 shadow-float',
              t.tone === 'ok' ? 'border-ok/30' : t.tone === 'crit' ? 'border-crit/30' : 'border-line',
            )}
          >
            <span
              className={cn(
                'mt-0.5 shrink-0',
                t.tone === 'ok' ? 'text-ok' : t.tone === 'crit' ? 'text-crit' : 'text-content-sub',
              )}
            >
              {t.tone === 'ok' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : t.tone === 'crit' ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Info className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sub font-bold text-content">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-caption text-content-sub">{t.body}</p> : null}
            </div>
            <button
              type="button"
              aria-label="إغلاق"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="-me-1 shrink-0 text-content-faint transition-colors hover:text-content"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast لازم يكون جوه ToastProvider');
  return ctx.toast;
}

/* ═══════════════════════ حالات الجلسة (المرحلة ٢) ═══════════════════════ */

/** بين ما الصفحة تفتح ولحد ما نتأكد مين الداخل (التجديد الصامت) */
export function SessionLoading({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-screen flex-1 items-center justify-center bg-canvas', className)}>
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"
        />
        <p className="text-sub font-bold text-content-sub">جاري التحقق من جلستك…</p>
      </div>
    </div>
  );
}

/** انتهت الجلسة أثناء الاستخدام (401 نهائي) — شاشة واضحة مش إعادة توجيه صامتة */
export function SessionExpired({
  onRelogin,
  className,
}: {
  onRelogin: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-screen flex-1 items-center justify-center bg-canvas px-6',
        className,
      )}
    >
      <div className="w-full max-w-sm animate-rise rounded-xl border border-line bg-surface p-7 text-center shadow-float">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft text-warn">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-h2 text-content">انتهت الجلسة</p>
        <p className="mt-2 text-body text-content-sub">
          لدواعي الأمان، الجلسة بتنتهي بعد فترة من عدم النشاط. سجّل دخولك تاني عشان تكمّل.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={onRelogin}>
          سجّل دخول تاني
        </Button>
      </div>
    </div>
  );
}
