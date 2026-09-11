'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './Button';

/** ديالوج أساسي — بيقفل بـEsc وبالضغط بره، وبيقفل سكرول الصفحة */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-ink/45 backdrop-blur-[2px]"
      />
      <div
        className={cn(
          'relative z-10 max-h-[88vh] w-full animate-rise overflow-hidden rounded-lg bg-surface shadow-float',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-h2 text-content">{title}</h2>
            {subtitle ? <p className="mt-1 text-sub text-content-sub">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-muted-soft hover:text-content"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-alt px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════
 * تأكيد الأكشنات الخطرة — ADMIN_DASHBOARD_SPEC §10.5
 *
 * إجباري على: منح التعاقد · ترقية دور · إيقاف مستخدم · تعليم مزاد متعثر.
 * الشرطين: **سبب مكتوب** (بيتسجل في audit_log.payload) + **تأكيد واعٍ**.
 *
 * الهدف مش «تصعيب» — الهدف إن الأكشن يسيب أثر يشرح ليه اتعمل.
 * ════════════════════════════════════════════════════════════════
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  /** الأثر الحقيقي بلغة واضحة — «ده بيدي المعرض حق المزايدة بفلوس» */
  impact,
  confirmLabel = 'أكّد',
  tone = 'crit',
  /** سبب مكتوب إجباري — بيروح لسجل التدقيق */
  requireReason = true,
  reasonLabel = 'سبب القرار',
  reasonHint = 'بيتسجّل في سجل التدقيق ومابيتمسحش',
  /** كلمة لازم تتكتب بالظبط — لأخطر الأكشنات */
  typeToConfirm,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  impact: string;
  confirmLabel?: string;
  tone?: 'crit' | 'accent';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  typeToConfirm?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
      setTyped('');
    }
  }, [open]);

  const reasonOk = !requireReason || reason.trim().length >= 4;
  const typedOk = !typeToConfirm || typed.trim() === typeToConfirm;
  const ready = reasonOk && typedOk;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            variant={tone === 'crit' ? 'danger' : 'primary'}
            onClick={() => onConfirm(reason.trim())}
            disabled={!ready}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-warn/25 bg-warn-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <p className="text-sub text-warn">{impact}</p>
        </div>

        {children}

        {requireReason ? (
          <label className="block">
            <span className="mb-1.5 block text-sub font-bold text-content">{reasonLabel}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="اكتب السبب بوضوح…"
              className="w-full resize-none rounded-sm border border-line bg-surface-alt px-3.5 py-2.5 text-sub text-content outline-none transition-colors placeholder:text-content-faint focus:border-accent"
            />
            <span className="mt-1 block text-caption text-content-faint">{reasonHint}</span>
          </label>
        ) : null}

        {typeToConfirm ? (
          <label className="block">
            <span className="mb-1.5 block text-sub font-bold text-content">
              اكتب «{typeToConfirm}» للتأكيد
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-sm border border-line bg-surface-alt px-3.5 py-2.5 text-sub text-content outline-none transition-colors focus:border-accent"
            />
          </label>
        ) : null}
      </div>
    </Dialog>
  );
}
