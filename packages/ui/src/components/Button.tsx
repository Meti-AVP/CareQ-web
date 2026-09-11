'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger' | 'white';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-95 active:brightness-90',
  ink: 'bg-ink text-white hover:bg-ink-soft',
  outline: 'border border-line-strong bg-surface text-content hover:bg-surface-alt',
  ghost: 'text-content-sub hover:bg-muted-soft hover:text-content',
  danger: 'bg-crit text-white hover:brightness-95',
  white: 'bg-white text-ink hover:bg-white/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sub gap-1.5 rounded-full',
  md: 'h-11 px-5 text-body gap-2 rounded-full',
  lg: 'h-[52px] px-7 text-title gap-2 rounded-full',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
}

/**
 * الزرار — نفس حس PressableScale في الموبايل:
 * ضغطة بتصغّر العنصر شوية بدل ما تغيّر لونه بس.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconEnd, loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-bold transition-all duration-150',
        'active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span className="shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconEnd && !loading ? (
        <span className="shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]">{iconEnd}</span>
      ) : null}
    </button>
  );
});

/** زرار أيقونة دايري — للأكشنات الجانبية في الجداول والرؤوس */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; onDark?: boolean }
>(function IconButton({ label, onDark, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95',
        onDark
          ? 'bg-white/10 text-white hover:bg-white/20'
          : 'text-content-sub hover:bg-muted-soft hover:text-content',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
