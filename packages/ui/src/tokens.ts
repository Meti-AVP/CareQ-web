/**
 * ════════════════════════════════════════════════════════════════
 * CarQ — رموز التصميم
 *
 * منقولة حرفيًا من `src/theme.ts` بتاع تطبيق الموبايل (ثيم zandvoort)
 * عشان الويب والموبايل يبقوا نفس المنتج بالظبط — مش «مستوحى منه».
 *
 * القاعدة: ممنوع أي hex ثابت بره الملف ده (ADMIN_DASHBOARD_SPEC §11).
 * لو محتاج لون مش هنا، ضيفه هنا الأول.
 * ════════════════════════════════════════════════════════════════
 */

/** الهوية — نفس أرقام zandvoort في الموبايل */
export const palette = {
  ink: '#131A2E',
  inkSoft: '#1C2540',
  inkBorder: '#2C3757',

  bg: '#F2F3F7',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFC',

  line: '#E6E8F0',
  lineStrong: '#D6D9E6',

  text: '#131A2E',
  textSub: '#6F7691',
  textFaint: '#A2A8BC',
  onInk: '#FFFFFF',
  onInkSub: 'rgba(255,255,255,0.66)',
  onInkFaint: 'rgba(255,255,255,0.40)',

  accent: '#EE4B1E',
  accentSoft: '#FDEDE7',
  accentInk: '#2A0A02',

  silver: '#BDC2D2',
} as const;

/**
 * ألوان الحالة — محجوزة (ADMIN_DASHBOARD_SPEC §7).
 * ممنوع تستخدمها كسلسلة في رسم فيه ألوان فئوية،
 * وعمرها ما تيجي لوحدها من غير أيقونة ونص.
 */
export const status = {
  success: '#15803D',
  successBg: '#E7F5EC',
  warning: '#B45309',
  warningBg: '#FBF0E2',
  critical: '#B3261E',
  criticalBg: '#F8E7E5',
  neutral: '#6F7691',
  neutralBg: '#EEF0F6',
} as const;

/**
 * باليتة التشارتس — متحقق منها بالسكريبت (ADMIN_DASHBOARD_SPEC §7).
 * متغيّرش لون من غير ما تعيد تشغيل validate_palette.js.
 */
export const chartPalette = {
  /** فئوية — بالترتيب ده بالظبط، وممنوع تدويرها */
  categorical: [
    '#EE4B1E', // برتقالي CarQ
    '#3D6FD9', // أزرق
    '#00998A', // تيل
    '#A8791A', // عسلي
    '#8E5BD0', // بنفسجي
    '#D2426F', // وردي
    '#4F7A28', // زيتي
  ],
  /** «أخرى» — وعاء الباقي، مش سلسلة */
  other: '#6F7691',
  /**
   * النواة الرباعية: لما أي لونين ممكن يتقارنوا مباشرة
   * (دونات، شرايح مكدّسة، legend طويل). عدّت فحص كل الأزواج.
   */
  safe4: ['#EE4B1E', '#3D6FD9', '#00998A', '#B5299B'],
  /** متدرّجة — للكثافة والخرايط */
  sequential: ['#E3EAF9', '#C2D2F2', '#93B0E8', '#5E88DC', '#3D6FD9', '#2B4E9C', '#1D3466'],
  /** متباعدة — لبيانات ليها اتجاهين حوالين صفر. النص رمادي محايد مش لون. */
  diverging: ['#00998A', '#7FC4BD', '#E8E8EA', '#F39A7E', '#EE4B1E'],
} as const;

/** نصف الأقطار — نفس مقاييس الموبايل */
export const radius = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

/**
 * سلم الخط — مقاييس الموبايل مكبّرة درجة للويب:
 * مسافة القراءة على المكتب أبعد من الموبايل، والمقاسات الأصلية طلعت
 * صغيرة على الشاشات الكبيرة (ملاحظة مالك المنتج).
 */
export const typeScale = {
  display: { size: 34, line: 46, weight: 800 },
  h1: { size: 27, line: 39, weight: 800 },
  h2: { size: 22, line: 33, weight: 700 },
  title: { size: 18, line: 27, weight: 700 },
  body: { size: 16, line: 25, weight: 500 },
  sub: { size: 14.5, line: 22, weight: 500 },
  caption: { size: 13, line: 19, weight: 500 },
} as const;

/**
 * ظلال ناعمة وغالية — مترجمة من Platform.select الخاص بالموبايل
 * (shadowColor = الحبر، مش أسود جامد)
 */
export const shadows = {
  card: '0 8px 16px rgba(19,26,46,0.06)',
  float: '0 12px 24px rgba(19,26,46,0.16)',
  pop: '0 2px 8px rgba(19,26,46,0.08)',
} as const;

/** مكوّن RGB بتاع الحبر — للتدرجات الشفافة، زي inkRgb في الموبايل */
export const inkRgb = '19,26,46';

/** تغطية الشيت الأبيض لرأس الصفحة الملوّن — SHEET_OVERLAP في الموبايل */
export const SHEET_OVERLAP = 26;
