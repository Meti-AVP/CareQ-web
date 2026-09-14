'use client';

import { Fragment, type ReactNode } from 'react';
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { cn } from '../lib/cn';
import { compactNumber, withThousands } from '../lib/format';
import { BAR_RADIUS, chartVars, divergingColor, seriesColor, sequentialColor } from './theme';

/**
 * مكتبة الرسوم — بتطبّق مواصفات ADMIN_DASHBOARD_SPEC §7 بالقوة.
 *
 * ملاحظة RTL مهمة: الـSVG مابيتعكسش مع `dir="rtl"`. فإحنا بنعكس يدوي
 * **في الأماكن الصح بس**:
 *  · السلاسل الزمنية: المحور السيني يفضل LTR (الأقدم شمال) — عُرف عالمي
 *  · المحور الصادي دايمًا `orientation="right"` عشان القراءة عربي
 *  · الأشرطة الأفقية: الفئات يمين والأعمدة بتمتد ناحية الشمال
 */

const numberFmt = (v: number) => compactNumber(v);

/* ═══════════════════════ التولتيب ═══════════════════════ */

interface TipRow {
  name: string;
  value: number | string;
  color?: string;
}

function TipShell({ label, rows, unit }: { label?: string; rows: TipRow[]; unit?: string }) {
  return (
    <div className="pointer-events-none rounded-sm border border-line bg-surface px-3 py-2 shadow-float">
      {label ? <p className="mb-1 text-caption font-bold text-content">{label}</p> : null}
      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-caption">
            {r.color ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            ) : null}
            <span className="text-content-sub">{r.name}</span>
            <span className="tnum me-0 ms-auto font-bold text-content">
              {typeof r.value === 'number' ? withThousands(r.value) : r.value}
              {unit ? ` ${unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function makeTooltip(unit?: string, labelFmt?: (l: string) => string) {
  return function CarqTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    return (
      <TipShell
        label={labelFmt && label !== undefined ? labelFmt(String(label)) : label ? String(label) : undefined}
        unit={unit}
        rows={payload.map((p) => ({
          name: String(p.name ?? ''),
          value: p.value as string | number,
          color: p.color ?? p.fill,
        }))}
      />
    );
  };
}

/* ═══════════════════════ أنواع مشتركة ═══════════════════════ */

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

interface BaseProps {
  data: Array<Record<string, string | number>>;
  height?: number;
  unit?: string;
}

const AXIS = {
  tick: { fill: chartVars.label, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: chartVars.grid },
  stroke: chartVars.grid,
} as const;

/**
 * تكات المحور الصادي (orientation="right") في مستند RTL:
 * الـSVG بيورث اتجاه الصفحة، فـ`start` بيمد النص **شمال** نقطة الربط —
 * جوه الرسمة فوق الأعمدة. `end` في RTL بيمد يمين، فالنص بيملأ العمود
 * المحجوز ليه بره الرسمة. (اللوحتين دايمًا RTL — مواصفة §8.)
 */
const Y_TICK = { fill: chartVars.label, fontSize: 12, textAnchor: 'end' } as const;
const Y_TICK_CATEGORY = { fill: chartVars.label, fontSize: 13, textAnchor: 'end' } as const;

/**
 * أنيميشن recharts متقفول في كل الرسوم:
 * ١) أخف — الداشبورد فيها رسوم كتير وإعادة الرسم المتحركة بتتقّل الصفحة
 * ٢) أي resize بيعيد الأنيميشن من الصفر — كان بيسبب رسوم فاضية في
 *    سكرينشوتات fullPage ووميض عند تغيير مقاس النافذة
 * (حركة الدخول للكروت نفسها CSS رخيصة وشغالة عادي.)
 */
const NO_ANIM = { isAnimationActive: false } as const;

/**
 * عرض عمود أسماء الفئات محسوب من أطول اسم فعلًا — مش رقم ثابت.
 * الأسماء العربية الطويلة («الإسكندرية»، «فولكس فاجن جولف») كانت
 * بتتقطع لما العرض الثابت يضيق عنها.
 */
function labelColWidth(
  data: Array<Record<string, string | number>>,
  labelKey: string,
  minWidth: number,
): number {
  const longest = data.reduce((m, row) => Math.max(m, String(row[labelKey] ?? '').length), 0);
  // ~٧.٥px متوسط عرض الحرف العربي على مقاس 13px + هامش
  return Math.min(210, Math.max(minWidth, Math.round(longest * 7.5) + 14));
}

/* ═══════════════════════ ١) سلسلة زمنية — خط ═══════════════════════ */

export function TimeSeriesLine({
  data,
  series,
  xKey = 'label',
  height = 260,
  unit,
  area = false,
  stacked = false,
  step = false,
}: BaseProps & {
  series: SeriesDef[];
  xKey?: string;
  /** مساحة بدل خط — للنمو التراكمي */
  area?: boolean;
  stacked?: boolean;
  /** درجي: المزايدة قفزات مش تدرّج (C-22, D-10) */
  step?: boolean;
}) {
  const Chart = area ? RAreaChart : RLineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
        <defs>
          {area
            ? series.map((s) => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))
            : null}
        </defs>
        <CartesianGrid stroke={chartVars.grid} vertical={false} />
        <XAxis dataKey={xKey} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} tick={Y_TICK} orientation="right" tickFormatter={numberFmt} width={52} />
        <Tooltip
          content={makeTooltip(unit)}
          cursor={{ stroke: chartVars.axis, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        {series.map((s) =>
          area ? (
            <Area
              key={s.key}
              {...NO_ANIM}
              type={step ? 'stepAfter' : 'monotone'}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'a' : undefined}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: chartVars.surface }}
            />
          ) : (
            <Line
              key={s.key}
              {...NO_ANIM}
              type={step ? 'stepAfter' : 'monotone'}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: chartVars.surface }}
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٢) أعمدة رأسية ═══════════════════════ */

export function VerticalBars({
  data,
  series,
  xKey = 'label',
  height = 260,
  unit,
  stacked = false,
  percent = false,
}: BaseProps & {
  series: SeriesDef[];
  xKey?: string;
  stacked?: boolean;
  /** مكدّس ١٠٠٪ — للتركيب النسبي */
  percent?: boolean;
}) {
  const rows = percent
    ? data.map((row) => {
        const total = series.reduce((sum, s) => sum + Number(row[s.key] ?? 0), 0) || 1;
        const out: Record<string, string | number> = { ...row };
        series.forEach((s) => {
          out[s.key] = (Number(row[s.key] ?? 0) / total) * 100;
        });
        return out;
      })
    : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid stroke={chartVars.grid} vertical={false} />
        {/* minTickGap بيمنع تكدّس أسماء الفئات لما يكتروا — بيتشال منهم بدل ما يتراكبوا */}
        <XAxis dataKey={xKey} {...AXIS} interval="equidistantPreserveStart" minTickGap={10} />
        <YAxis
          {...AXIS}
          tick={Y_TICK}
          orientation="right"
          width={52}
          tickFormatter={percent ? (v: number) => `${Math.round(v)}٪` : numberFmt}
          domain={percent ? [0, 100] : undefined}
        />
        <Tooltip content={makeTooltip(percent ? '٪' : unit)} cursor={{ fill: 'rgba(19,26,46,0.04)' }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            {...NO_ANIM}
            dataKey={s.key}
            name={s.label}
            stackId={stacked || percent ? 'a' : undefined}
            fill={s.color}
            // فاصل ٢px بلون السطح بين الشرايح والأعمدة المتجاورة
            stroke={chartVars.surface}
            strokeWidth={stacked || percent ? 2 : 0}
            // تدوير من ناحية القيمة بس — والمكدّس آخر شريحة بس
            radius={
              stacked || percent
                ? i === series.length - 1
                  ? [BAR_RADIUS, BAR_RADIUS, 0, 0]
                  : [0, 0, 0, 0]
                : [BAR_RADIUS, BAR_RADIUS, 0, 0]
            }
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٣) أشرطة أفقية ═══════════════════════ */

/**
 * الشكل المفضّل للفئات بأسماء عربية طويلة (§5): الاسم يمين والشريط
 * بيمتد ناحية الشمال. بيقبل ألوان لكل صف (للحالات).
 */
export function HorizontalBars({
  data,
  height = 260,
  unit,
  labelKey = 'label',
  valueKey = 'value',
  colorKey,
  color,
  maxLabelWidth = 132,
}: BaseProps & {
  labelKey?: string;
  valueKey?: string;
  /** عمود فيه لون مخصوص لكل صف — للحالات زي draft */
  colorKey?: string;
  color?: string;
  maxLabelWidth?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
        barCategoryGap="26%"
      >
        <CartesianGrid stroke={chartVars.grid} horizontal={false} />
        {/* reversed: الأعمدة بتمتد ناحية الشمال — اتجاه القراءة العربي */}
        <XAxis type="number" {...AXIS} tickFormatter={numberFmt} reversed />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...AXIS}
          orientation="right"
          width={labelColWidth(data, labelKey, maxLabelWidth)}
          interval={0}
          tick={Y_TICK_CATEGORY}
        />
        <Tooltip content={makeTooltip(unit)} cursor={{ fill: 'rgba(19,26,46,0.04)' }} />
        <Bar {...NO_ANIM} dataKey={valueKey} radius={[BAR_RADIUS, 0, 0, BAR_RADIUS]} name={unit ?? 'العدد'}>
          {data.map((row, i) => (
            <Cell
              key={i}
              fill={colorKey ? String(row[colorKey]) : (color ?? seriesColor(0))}
            />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٤) شريط متباعد ═══════════════════════ */

/**
 * الشكل **الوحيد الصح** لبيانات ليها اتجاهين حوالين صفر
 * (C-13 العرض مقابل الاقتراح · C-21 الارتفاع فوق البداية · D-05 السعر مقابل السوق).
 * تيل = فوق · برتقالي = تحت · والنص رمادي محايد.
 */
export function DivergingBars({
  data,
  height = 260,
  labelKey = 'label',
  valueKey = 'value',
  unit = '٪',
  maxLabelWidth = 132,
}: BaseProps & {
  labelKey?: string;
  valueKey?: string;
  maxLabelWidth?: number;
}) {
  const max = Math.max(...data.map((d) => Math.abs(Number(d[valueKey] ?? 0))), 1);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
        barCategoryGap="26%"
        stackOffset="sign"
      >
        <CartesianGrid stroke={chartVars.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={[-max, max]}
          {...AXIS}
          tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}${unit}`}
          reversed
        />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...AXIS}
          orientation="right"
          width={labelColWidth(data, labelKey, maxLabelWidth)}
          interval={0}
          tick={Y_TICK_CATEGORY}
        />
        <Tooltip content={makeTooltip(unit)} cursor={{ fill: 'rgba(19,26,46,0.04)' }} />
        {/* خط الصفر بارز — هو مرجع القراءة كله */}
        <ReferenceLine x={0} stroke={chartVars.axis} strokeWidth={1.5} />
        <Bar {...NO_ANIM} dataKey={valueKey} name="الفرق" radius={BAR_RADIUS}>
          {data.map((row, i) => (
            <Cell key={i} fill={divergingColor(Number(row[valueKey] ?? 0), max)} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٥) هيستوجرام ═══════════════════════ */

/** شكل التوزيع، مش متوسطه (C-07 الأسعار · C-12 زمن الرد · C-34 القسط) */
export function Histogram({
  data,
  height = 260,
  labelKey = 'label',
  valueKey = 'value',
  color,
  unit,
}: BaseProps & {
  labelKey?: string;
  valueKey?: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="8%">
        <CartesianGrid stroke={chartVars.grid} vertical={false} />
        {/* الباكتات كتير والأسماء طويلة — بنعرض عيّنة متباعدة بدل التراكب */}
        <XAxis dataKey={labelKey} {...AXIS} interval="equidistantPreserveStart" minTickGap={14} />
        <YAxis {...AXIS} tick={Y_TICK} orientation="right" width={52} tickFormatter={numberFmt} />
        <Tooltip content={makeTooltip(unit)} cursor={{ fill: 'rgba(19,26,46,0.04)' }} />
        <Bar
          {...NO_ANIM}
          dataKey={valueKey}
          name="العدد"
          fill={color ?? seriesColor(1)}
          radius={[BAR_RADIUS, BAR_RADIUS, 0, 0]}
          stroke={chartVars.surface}
          strokeWidth={1}
        />
      </RBarChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٦) قمع ═══════════════════════ */

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  hint?: string;
}

/**
 * القمع بيوري **فين الناس بتقع** بالظبط (C-08 · C-11 · C-30).
 * مرسوم بـdivs مش SVG: أوضح في RTL، وكل خطوة بتعرض نسبتها من اللي قبلها
 * ومن البداية — لأن الاتنين بيجاوبوا على سؤالين مختلفين.
 */
export function Funnel({ steps, className }: { steps: FunnelStep[]; className?: string }) {
  const first = steps[0]?.count ?? 0;
  return (
    <div className={cn('space-y-2.5', className)}>
      {steps.map((s, i) => {
        const prev = i === 0 ? s.count : steps[i - 1]!.count;
        const width = first > 0 ? Math.max(6, (s.count / first) * 100) : 0;
        const fromPrev = prev > 0 ? (s.count / prev) * 100 : 0;
        const dropped = prev - s.count;
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sub font-bold text-content">{s.label}</span>
              <span className="tnum text-caption text-content-sub">
                {withThousands(s.count)}
                {i > 0 ? (
                  // فاصل صريح (مش margin بس) — من غير كده الرقمين بيتلزقوا في أي
                  // نسخ نص/screen reader (190 ثم 85% بيتقروا/بيتنسخوا "19085%")
                  <span className={cn('ms-2', fromPrev < 50 ? 'text-crit' : 'text-content-faint')}>
                    {' · '}
                    {Math.round(fromPrev)}٪ من اللي قبلها
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-9 overflow-hidden rounded-xs bg-muted-soft">
              <div
                className="h-full rounded-xs transition-all duration-500"
                style={{ width: `${width}%`, backgroundColor: seriesColor(i) }}
              />
            </div>
            {i > 0 && dropped > 0 ? (
              <p className="mt-1 text-caption text-content-faint">
                وقع {withThousands(dropped)} في الخطوة دي
                {s.hint ? ` — ${s.hint}` : ''}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ ٧) نقاط مبعثرة ═══════════════════════ */

type ScatterPoint = { x: number; y: number; group?: string; color?: string; label?: string };

/** بيكشف الشواذ والإعلانات المشبوهة (C-09 السعر × العداد) */
export function ScatterPlot({
  points,
  height = 280,
  xLabel,
  yLabel,
  xFormat = numberFmt,
  yFormat = numberFmt,
}: {
  points: Array<{ x: number; y: number; group?: string; color?: string; label?: string }>;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RScatterChart margin={{ top: 8, right: 8, left: 8, bottom: 18 }}>
        <CartesianGrid stroke={chartVars.grid} />
        <XAxis
          type="number"
          dataKey="x"
          {...AXIS}
          tickFormatter={xFormat}
          name={xLabel}
          label={
            xLabel
              ? { value: xLabel, position: 'insideBottom', offset: -10, fill: chartVars.label, fontSize: 11 }
              : undefined
          }
        />
        <YAxis
          type="number"
          dataKey="y"
          {...AXIS}
          tick={Y_TICK}
          orientation="right"
          width={56}
          tickFormatter={yFormat}
          name={yLabel}
        />
        <ZAxis range={[64, 64]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3', stroke: chartVars.axis }}
          content={({ active, payload }: TooltipProps<ValueType, NameType>) => {
            if (!active || !payload?.length) return null;
            // recharts بتسيب شكل نقطة الداتا الأصلية `any` في تعريفها
            // هي — دي نفس نقطة `points` اللي بعتناها أصلًا
            const p = payload[0]?.payload as ScatterPoint;
            return (
              <TipShell
                label={p.label}
                rows={[
                  { name: xLabel ?? 'س', value: xFormat(p.x) },
                  { name: yLabel ?? 'ص', value: yFormat(p.y) },
                  ...(p.group ? [{ name: 'الفئة', value: p.group, color: p.color }] : []),
                ]}
              />
            );
          }}
        />
        <Scatter {...NO_ANIM} data={points} fillOpacity={0.75}>
          {points.map((p, i) => (
            <Cell key={i} fill={p.color ?? seriesColor(0)} />
          ))}
        </Scatter>
      </RScatterChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════ ٨) هيت ماب ═══════════════════════ */

/** نشاط الأدمن: يوم × ساعة (C-52) */
export function Heatmap({
  rows,
  cols,
  values,
  unit = 'حدث',
}: {
  rows: string[];
  cols: string[];
  /** values[rowIndex][colIndex] */
  values: number[][];
  unit?: string;
}) {
  const max = Math.max(1, ...values.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(0,1fr))` }}
        >
          <span />
          {cols.map((c) => (
            <span key={c} className="text-center text-[10px] text-content-faint">
              {c}
            </span>
          ))}
          {rows.map((r, ri) => (
            <Fragment key={r}>
              <span className="flex items-center justify-end pe-2 text-caption text-content-sub">
                {r}
              </span>
              {cols.map((c, ci) => {
                const v = values[ri]?.[ci] ?? 0;
                return (
                  <span
                    key={c}
                    title={`${r} · ${c} — ${withThousands(v)} ${unit}`}
                    className="h-6 rounded-[4px] transition-transform hover:scale-110"
                    style={{
                      backgroundColor: v === 0 ? 'var(--surface-alt)' : sequentialColor(v / max),
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-caption text-content-faint">
          <span>أقل</span>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span
              key={t}
              className="h-3 w-6 rounded-[3px]"
              style={{ backgroundColor: sequentialColor(t) }}
            />
          ))}
          <span>أكتر</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ ٩) شريط نسبي مفرد ═══════════════════════ */

/**
 * شريط مكدّس ١٠٠٪ في سطر واحد — لمؤشر السعر العادل (C-04) وحالة
 * المخزون (D-03). شريحة «مش متسعّر» (null) **لازم تفضل ظاهرة برمادي**:
 * إخفاؤها بيخبّي البداية الباردة (P-4).
 */
export function StackedShare({
  segments,
  height = 44,
  showLabels = true,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  height?: number;
  showLabels?: boolean;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-xs bg-muted-soft"
        style={{ height }}
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join('، ')}
      >
        {segments.map((s) => {
          const pct = (s.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s.key}
              title={`${s.label} — ${withThousands(s.value)} (${Math.round(pct)}٪)`}
              className="group relative flex items-center justify-center border-e-2 border-surface last:border-e-0 transition-opacity hover:opacity-90"
              style={{ width: `${pct}%`, backgroundColor: s.color }}
            >
              {pct > 9 ? (
                <span className="tnum text-caption font-bold text-white">{Math.round(pct)}٪</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {showLabels ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-caption text-content-sub">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="tnum font-bold text-content">{withThousands(s.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ═══════════════════════ ١٠) داتا قليلة ═══════════════════════ */

/** أقل من ٣ نقط ⇒ اعرض أرقام مش خط (§7) */
export function SparseValues({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="flex w-full flex-wrap gap-6 px-2">
      {items.map((it, i) => (
        <div key={i}>
          <p className="text-caption text-content-sub">{it.label}</p>
          <p className="mt-1 text-h2 text-content">{it.value}</p>
        </div>
      ))}
    </div>
  );
}
