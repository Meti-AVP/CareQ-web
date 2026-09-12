'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Download, Table2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { buildCsv, downloadCsv } from '../lib/csv';
import { withThousands } from '../lib/format';
import { EmptyState, ErrorState, Skeleton } from '../components/Primitives';

/**
 * ════════════════════════════════════════════════════════════════
 * إطار الرسم — كل رسم في الداشبورد بيتلف فيه.
 *
 * بيفرض ٤ قواعد من ADMIN_DASHBOARD_SPEC §7 مرة واحدة بدل ما كل رسم
 * يفتكرها لوحده:
 *  ١) **«عرض كجدول»** لكل رسم — إتاحة، ومصدر تصدير CSV في نفس الوقت
 *  ٢) الحالات الأربعة: تحميل · فاضي · خطأ · بيانات قليلة
 *  ٣) legend: سلسلة واحدة ⇒ مفيش · ٢ فأكتر ⇒ دايمًا
 *  ٤) العنوان بيسمّي السلسلة الواحدة، فمش محتاج legend يكررها
 * ════════════════════════════════════════════════════════════════
 */

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartFrameProps {
  title: string;
  /** رقم الرسم في الكتالوج — C-01, D-05… بيسهّل الرجوع للمواصفة */
  code?: string;
  hint?: string;
  series?: ChartSeries[];
  /** صفوف الجدول البديل والتصدير: كل صف {label, ...values} */
  tableRows?: Array<Record<string, string | number>>;
  tableColumns?: Array<{ key: string; label: string }>;
  loading?: boolean;
  error?: string;
  /** «حاول تاني» جوه حالة الخطأ — مرّر refetch بتاع الاستعلام */
  onRetry?: () => void;
  /** فاضي = مفيش بيانات في الفترة، مش رسم فاضي */
  isEmpty?: boolean;
  /** بيانات قليلة (< ٣ نقط): اعرض أرقام مش خط */
  sparse?: ReactNode;
  /** ملاحظة تحت الرسم — زي «مستبعد ١٢ إعلان مش متسعّر» */
  footnote?: string;
  height?: number;
  className?: string;
  children: ReactNode;
}

export function ChartFrame({
  title,
  code,
  hint,
  series,
  tableRows,
  tableColumns,
  loading,
  error,
  onRetry,
  isEmpty,
  sparse,
  footnote,
  height = 260,
  className,
  children,
}: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);

  /** خلايا معقّمة ضد حقن المعادلات — نفس قواعد تصدير الجداول */
  const csv = useMemo(() => {
    if (!tableRows?.length || !tableColumns?.length) return '';
    return buildCsv(
      tableColumns.map((c) => c.label),
      tableRows.map((r) => tableColumns.map((c) => r[c.key] ?? '')),
    );
  }, [tableRows, tableColumns]);

  const download = () => downloadCsv(`${code ? `${code}-` : ''}${title}`, csv);

  const canTable = Boolean(tableRows?.length && tableColumns?.length);
  const showLegend = (series?.length ?? 0) >= 2;

  return (
    <figure
      className={cn(
        'flex flex-col rounded-lg border border-line bg-surface p-5 shadow-card',
        className,
      )}
    >
      <figcaption className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-title text-content">{title}</h3>
          {hint ? <p className="mt-0.5 text-caption text-content-sub">{hint}</p> : null}
        </div>
        {canTable ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              aria-pressed={asTable}
              title={asTable ? 'عرض كرسم' : 'عرض كجدول'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-muted-soft hover:text-content"
            >
              {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={download}
              title="تنزيل CSV"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-muted-soft hover:text-content"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </figcaption>

      {/* legend: سلسلة واحدة ⇒ العنوان بيسمّيها، مفيش legend */}
      {showLegend && !asTable ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series!.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-caption text-content-sub">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="min-w-0 flex-1" style={{ minHeight: height }}>
        {loading ? (
          <div className="flex h-full flex-col justify-end gap-2 pb-2" style={{ height }}>
            <div className="flex items-end gap-2">
              {[60, 85, 45, 95, 70, 55, 80].map((h, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState
            title="مفيش بيانات في الفترة دي"
            hint="غيّر مدى التاريخ أو الفلاتر — أول ما تدخل بيانات هتظهر هنا."
            icon={<BarChart3 className="h-6 w-6" />}
          />
        ) : sparse ? (
          <div style={{ minHeight: height }} className="flex items-center">
            {sparse}
          </div>
        ) : asTable && canTable ? (
          <ChartTable rows={tableRows!} columns={tableColumns!} maxHeight={height} />
        ) : (
          children
        )}
      </div>

      {footnote && !loading && !isEmpty ? (
        <p className="mt-3 border-t border-line pt-2.5 text-caption text-content-faint">{footnote}</p>
      ) : null}
    </figure>
  );
}

/** الجدول البديل للرسم — نفس البيانات بالظبط */
function ChartTable({
  rows,
  columns,
  maxHeight,
}: {
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; label: string }>;
  maxHeight: number;
}) {
  return (
    <div className="overflow-auto rounded-sm border border-line" style={{ maxHeight }}>
      <table className="w-full text-sub">
        <thead className="sticky top-0 bg-surface-alt">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="border-b border-line px-3 py-2 text-start text-caption font-bold text-content-sub"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-content">
                  {typeof r[c.key] === 'number'
                    ? withThousands(r[c.key] as number)
                    : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
