'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { cn } from '../lib/cn';
import { buildCsv, downloadCsv } from '../lib/csv';
import { withThousands } from '../lib/format';
import { Button } from './Button';
import { EmptyState, ErrorState, TableSkeleton } from './Primitives';

/**
 * جدول البيانات — الجداول هنا هي **نص الشغل** (ADMIN_DASHBOARD_SPEC §1).
 *
 * بيفرض متطلبات §11 مرة واحدة:
 *  · الحالات الأربعة: تحميل · نجاح · فاضي · خطأ
 *  · pagination دايمًا: cursor من السيرفر لو الصفحة مرّرته،
 *    وإلا تقسيم محلي تلقائي — **مفيش جدول من غير صفحات**
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
  /** القيمة الخام — للفرز والتصدير. `null` = «مفيش قيمة» وبييجي آخر الترتيب دايمًا (P-4) */
  value?: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
  /** يتخفي في الشاشات الضيقة */
  hideBelow?: 'md' | 'lg' | 'xl';
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  /** اسم الجدول لقارئ الشاشة — `<caption>` مخفي بصريًا (المرحلة ٨، a11y) */
  caption?: string;
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
  /** حجم صفحة التقسيم المحلي — بيشتغل تلقائي لو مفيش cursor من السيرفر */
  pageSize?: number;
  toolbar?: ReactNode;
  className?: string;
}

const alignClass = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
const hideClass = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
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
  pageSize = 25,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  /** صفحة التقسيم المحلي — بيشتغل بس لما مفيش cursor من السيرفر */
  const [localPage, setLocalPage] = useState(0);

  const rawValue = (row: T, col: Column<T>): string | number | null => {
    if (col.value) return col.value(row);
    const v = (row as Record<string, unknown>)[col.key];
    return typeof v === 'number' ? v : String(v ?? '');
  };

  const visible = useMemo(() => {
    let out = rows;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => String(rawValue(r, c) ?? '').toLowerCase().includes(q)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = rawValue(a, col);
          const bv = rawValue(b, col);
          // «مفيش قيمة» آخر الترتيب في الاتجاهين — مش بتتنكر كصفر (P-4)
          if (av === null || bv === null) {
            if (av === null && bv === null) return 0;
            return av === null ? 1 : -1;
          }
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

  /**
   * وضعان للتقسيم:
   *  · سيرفر: الصفحة مرّرت onNext/onPrev — الجدول بيعرض اللي جاله زي ما هو.
   *  · محلي: مفيش cursor — الجدول بيقسّم بنفسه على pageSize،
   *    عشان قاعدة «كل جدول ليه pagination» تتحقق في كل مكان.
   */
  const serverPaged = Boolean(onNext || onPrev);
  const pageCount = serverPaged ? 1 : Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(localPage, pageCount - 1);
  const paged = serverPaged
    ? visible
    : visible.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // أي تغيير في البيانات أو البحث أو الفرز بيرجّع لأول صفحة
  useEffect(() => {
    setLocalPage(0);
  }, [rows.length, query, sort]);

  const localInfo =
    visible.length > 0
      ? `${withThousands(safePage * pageSize + 1)} – ${withThousands(safePage * pageSize + paged.length)} من ${withThousands(visible.length)}`
      : undefined;

  const showFooter =
    !loading &&
    !error &&
    visible.length > 0 &&
    (serverPaged ? Boolean(onNext || onPrev) : pageCount > 1);

  /** التصدير بيلم كل الصفوف المفلترة مش الصفحة بس — والخلايا معقّمة ضد حقن المعادلات */
  const exportCsv = () => {
    downloadCsv(
      exportName ?? 'carq',
      buildCsv(
        columns.map((c) => c.header),
        visible.map((r) => columns.map((c) => rawValue(r, c) ?? '')),
      ),
    );
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
            {caption ? <caption className="sr-only">{caption}</caption> : null}
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
              {paged.map((row) => {
                const tone = rowTone?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    data-row-id={rowKey(row)}
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
                        {c.render ? c.render(row) : String(rawValue(row, c) ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showFooter ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="tnum text-caption text-content-sub">
            {serverPaged ? pageInfo : localInfo}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={serverPaged ? onPrev : () => setLocalPage((p) => Math.max(0, p - 1))}
              disabled={serverPaged ? !canPrev : safePage === 0}
              icon={<ChevronRight />}
            >
              السابق
            </Button>
            {!serverPaged ? (
              <span className="tnum px-1 text-caption font-bold text-content-sub">
                {withThousands(safePage + 1)} / {withThousands(pageCount)}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={serverPaged ? onNext : () => setLocalPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={serverPaged ? !hasMore : safePage >= pageCount - 1}
              iconEnd={<ChevronLeft />}
            >
              التالي
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
