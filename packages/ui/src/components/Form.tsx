'use client';

import { createContext, forwardRef, useContext, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

const fieldBase =
  'w-full rounded-sm border border-line bg-surface-alt px-3.5 text-body text-content outline-none transition-colors placeholder:text-content-faint focus:border-accent focus:bg-surface disabled:opacity-50';

/**
 * ربط الليبل بالخانة بيتم بالسياق مش بـhtmlFor:
 * الخانة جوه Field ممكن تكون متلفوفة في div (أيقونة جوه الخانة مثلًا)
 * أو يكون فيه أكتر من خانة تحت نفس الليبل — `aria-labelledby` بيشتغل
 * صح في الحالتين، وقارئ الشاشة بيقرا الليبل والخطأ مع بعض.
 */
const FieldCtx = createContext<{
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
}>({});

/** غلاف الحقل: label + تلميح + رسالة خطأ — وكله متوصّل ببعضه للـa11y */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const msgId = `${id}-msg`;
  const hasMsg = Boolean(error || hint);

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label id={labelId} className="block text-sub font-bold text-content">
          {label}
          {required ? <span className="ms-1 text-accent">*</span> : null}
        </label>
      ) : null}
      <FieldCtx.Provider
        value={{
          labelledBy: label ? labelId : undefined,
          describedBy: hasMsg ? msgId : undefined,
          invalid: Boolean(error),
        }}
      >
        {children}
      </FieldCtx.Provider>
      {error ? (
        <p id={msgId} className="flex items-center gap-1.5 text-caption font-bold text-crit">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-caption text-content-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** بيوصّل خصائص الـa11y من Field لأقرب خانة — من غير ما يدوس على اللي جاي من بره */
function useFieldA11y(rest: {
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: InputHTMLAttributes<HTMLInputElement>['aria-invalid'];
}) {
  const ctx = useContext(FieldCtx);
  return {
    'aria-labelledby':
      rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : ctx.labelledBy),
    'aria-describedby': rest['aria-describedby'] ?? ctx.describedBy,
    'aria-invalid': rest['aria-invalid'] ?? (ctx.invalid ? true : undefined),
  } as const;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    const a11y = useFieldA11y(rest);
    return (
      <input
        ref={ref}
        className={cn(fieldBase, 'h-11', invalid && 'border-crit focus:border-crit', className)}
        {...rest}
        {...a11y}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  const a11y = useFieldA11y(rest);
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, 'resize-none py-2.5', invalid && 'border-crit focus:border-crit', className)}
      {...rest}
      {...a11y}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...rest }, ref) {
  const a11y = useFieldA11y(rest);
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-11 appearance-none pe-9',
          invalid && 'border-crit focus:border-crit',
          className,
        )}
        {...rest}
        {...a11y}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-content-faint" />
    </div>
  );
});

/** مفتاح — للأعلام اللي بتتغيّر بقرار (شارات الثقة، التعاقد) */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
  tone = 'accent',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  tone?: 'accent' | 'ok';
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? (tone === 'ok' ? 'bg-ok' : 'bg-accent') : 'bg-line-strong',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute h-5 w-5 rounded-full bg-white shadow-pop transition-all',
            // dir=rtl: المفتاح بيتحرك ناحية الشمال لما يتفعّل
            checked ? 'start-[22px]' : 'start-0.5',
          )}
        />
      </button>
      {(label || hint) && (
        <label htmlFor={id} className="cursor-pointer select-none">
          {label ? <span className="block text-body font-bold text-content">{label}</span> : null}
          {hint ? <span className="mt-0.5 block text-caption text-content-sub">{hint}</span> : null}
        </label>
      )}
    </div>
  );
}

/** مجموعة اختيار واحد على شكل شرائح — للمقدم والمدة والفلاتر */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-1 rounded-full bg-muted-soft p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full font-bold transition-all',
              size === 'sm' ? 'h-8 px-3 text-caption' : 'h-9 px-4 text-sub',
              active
                ? 'bg-surface text-content shadow-pop'
                : 'text-content-sub hover:text-content',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** صندوق رفع ملف بحدود متقطعة — نفس حس فورم التقسيط في التطبيق */
export function FileDrop({
  label,
  hint,
  fileName,
  onPick,
  accept = 'image/*,application/pdf',
  invalid,
  disabled,
  icon,
}: {
  label: string;
  hint?: string;
  fileName?: string | null;
  onPick: (file: File) => void;
  accept?: string;
  invalid?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  const done = Boolean(fileName);
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors',
        done
          ? 'border-ok/40 bg-ok-soft'
          : invalid
            ? 'border-crit/50 bg-crit-soft'
            : 'border-line-strong bg-surface-alt hover:border-accent hover:bg-accent-soft/40',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <span className={cn('[&>svg]:h-6 [&>svg]:w-6', done ? 'text-ok' : 'text-content-faint')}>
        {done ? <Check /> : icon}
      </span>
      <span className={cn('text-sub font-bold', done ? 'text-ok' : 'text-content')}>
        {done ? 'تم الإرفاق' : label}
      </span>
      <span className="text-caption text-content-faint">{done ? fileName : hint}</span>
    </label>
  );
}
