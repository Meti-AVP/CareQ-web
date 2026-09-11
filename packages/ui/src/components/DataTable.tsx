'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { EmptyState, ErrorState, TableSkeleton } from './Primitives';

/**
 * جدول البيانات — الجداول هنا هي **نص الشغل** (ADMIN_DASHBOARD_SPEC §1).
 *
 * بيفرض متطلبات §11 مرة واحدة:
 *  · الحالات الأربعة: تحميل · نجاح · فاضي · خطأ
 *  · pagination حقيقي (cursor) — مش تحميل ٢٠٠ صف وتقطيعهم محليًا
 *  · تصدير CSV
 *
 * مكتوب بدون TanStack Table عن قصد: احتياجنا فرز/فلترة بسيطة،
 * والـcursor pagination جاي من السيرفر أصلًا. أقل كود = أقل مساحة خطأ.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** عرض ثابت للعمود */
  width?: number;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  /** القيمة الخام — للفرز والتصدير */
  value?: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  /** يتخفي في الشاشات الضيقة */
  hideBelow?: 'md' | 'lg' | 'xl';
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** صف بيتعلّم بلون تنبيه — زي طلب مستني أكتر من ٢٤ ساعة */
  rowTone?: (row: T) => 'crit' | 'warn' | undefined;
  searchable?: boolean;
  searchPlaceholder?: string;
  exportName?: string;
  /** pagination بالـcursor من السيرفر */
  hasMore?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  canPrev?: boolean;
  pageInfo?: string;
  toolbar?: ReactNode;
  className?: string;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
const hideClass = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'مفيش نتايج',
  emptyHint,
  emptyAction,
  onRowClick,
  rowTone,
  searchable,
  searchPlaceholder = 'دوّر…',
  exportName,
  hasMore,
  onNext,
  onPrev,
  canPrev,
  pageInfo,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const rawValue = (row: T, col: Column<T>): string | number => {
    if (col.value) return col.value(row);
    const v = (row as Record<string, unknown>)[col.key];
    return typeof v === 'number' ? v : String(v ?? '');
  };

  const visible = useMemo(() => {
    let out = rows;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => String(rawValue(r, c)).toLowerCase().includes(q)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = rawValue(a, col);
          const bv = rawValue(b, col);
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv), 'ar');
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, query, sort]);

  const exportCsv = () => {
    const head = columns.map((c) => c.header).join(',');
    const body = visible
      .map((r) => columns.map((c) => `"${String(rawValue(r, c)).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName ?? 'carq'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-surface shadow-card', className)}>
      {(searchable || toolbar || exportName) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          {searchable ? (
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-content-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-full border border-line bg-surface-alt ps-9 pe-4 text-sub text-content outline-none transition-colors placeholder:text-content-faint focus:border-accent"
              />
            </div>
          ) : null}
          {toolbar}
          {exportName ? (
            <Button variant="outline" size="sm" icon={<Download />} onClick={exportCsv}>
              تصدير
            </Button>
          ) : null}
        </div>
      )}

      {loading ? (
        <TableSkeleton cols={Math.min(columns.length, 6)} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : visible.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-alt">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    className={cn(
                      'whitespace-nowrap border-b border-line px-4 py-3 text-caption font-bold text-content-sub',
                      alignClass[c.align ?? 'start'],
                      c.hideBelow && hideClass[c.hideBelow],
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSort((s) =>
                            s?.key === c.key
                              ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                              : { key: c.key, dir: 'desc' },
                          )
                        }
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-content',
                          sort?.key === c.key && 'text-accent',
                        )}
                      >
                        {c.header}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const tone = rowTone?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-line transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-surface-alt',
                      tone === 'crit' && 'bg-crit-soft/40',
                      tone === 'warn' && 'bg-warn-soft/40',
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-4 py-3 text-sub text-content',
                          alignClass[c.align ?? 'start'],
                          c.hideBelow && hideClass[c.hideBelow],
                        )}
                      >
                        {c.render ? c.render(row) : String(rawValue(row, c))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(onNext || onPrev) && !loading && visible.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="text-caption text-content-sub">{pageInfo}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={!canPrev} icon={<ChevronRight />}>
              السابق
            </Button>
            <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore} iconEnd={<ChevronLeft />}>
              التالي
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
