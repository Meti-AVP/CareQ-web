/**
 * ════════════════════════════════════════════════════════════════
 * مواصفات الرسم — ADMIN_DASHBOARD_SPEC §7
 *
 * القواعد دي مش تفضيلات شكلية، دي عقد:
 *  · الأعمدة نهاياتها مدوّرة ٤px من ناحية القيمة بس، ملزوقة في خط الأساس
 *  · الخطوط ٢px، والنقط ≥ ٨px
 *  · فاصل ٢px بلون الـsurface بين الشرايح المكدّسة والأعمدة المتجاورة
 *  · الشبكة والمحاور باهتة، والقيم والـlabels بألوان النص —
 *    عمرها ما تلبس لون السلسلة
 *  · سلسلة واحدة ⇒ من غير legend · ٢ فأكتر ⇒ legend دايمًا
 *  · ممنوع dual-axis نهائيًا — مقياسين مختلفين = رسمين
 * ════════════════════════════════════════════════════════════════
 */
import { chartPalette } from '../tokens';

/** ألوان بتتقرا من متغيرات CSS فالوضع الغامق بيشتغل من غير قلب تلقائي */
export const chartVars = {
  grid: 'var(--line)',
  axis: 'var(--text-faint)',
  label: 'var(--text-sub)',
  value: 'var(--text)',
  surface: 'var(--surface)',
} as const;

/** الفاصل بين الشرايح المكدّسة والأعمدة المتجاورة */
export const SLICE_GAP = 2;
/** تدوير نهاية العمود من ناحية القيمة بس */
export const BAR_RADIUS = 4;

/**
 * لون السلسلة رقم i. ممنوع تدوير الباليتة (§7):
 * بعد السابعة بيرجع الرمادي «أخرى» — وده إشارة إنك محتاج تجمّع
 * الباقي في وعاء واحد، مش تخترع لون تامن.
 */
export function seriesColor(index: number): string {
  return chartPalette.categorical[index] ?? chartPalette.other;
}

/**
 * لما الألوان ممكن تتقارن مباشرة (دونات، مكدّس، legend طويل)
 * استخدم النواة الرباعية بس — دي اللي عدّت فحص كل الأزواج.
 * فوق ٤ فئات؟ متزوّدش لون — حوّل لشريط أفقي.
 */
export function safeColor(index: number): string {
  return chartPalette.safe4[index] ?? chartPalette.other;
}

/** تدرّج متباعد حوالين صفر — النص رمادي محايد مش لون */
export function divergingColor(value: number, max: number): string {
  const [negStrong, negSoft, mid, posSoft, posStrong] = chartPalette.diverging;
  if (max === 0) return mid;
  const t = Math.max(-1, Math.min(1, value / max));
  if (t <= -0.5) return negStrong;
  if (t < -0.08) return negSoft;
  if (t <= 0.08) return mid;
  if (t < 0.5) return posSoft;
  return posStrong;
}

/** لون متدرّج بكثافة — للخرايط والهيت ماب */
export function sequentialColor(t: number): string {
  const scale = chartPalette.sequential;
  const idx = Math.max(0, Math.min(scale.length - 1, Math.round(t * (scale.length - 1))));
  return scale[idx]!;
}

/** خصائص المحاور — باهتة ومن غير ألوان سلاسل */
export const axisProps = {
  stroke: chartVars.grid,
  tick: { fill: chartVars.label, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: chartVars.grid },
} as const;

export const gridProps = {
  stroke: chartVars.grid,
  strokeDasharray: '0',
  vertical: false,
} as const;

/**
 * المحور السيني في السلاسل الزمنية بيفضل من الشمال لليمين
 * (الأقدم شمال) — المتعارف عليه عالميًا حتى في الواجهات العربية.
 * بس المحور الصادي وأسماء الفئات بتتحاذي يمين (§8).
 */
export const TIME_AXIS_DIR = 'ltr' as const;
