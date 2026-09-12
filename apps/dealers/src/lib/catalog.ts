import { withThousands } from '@carq/ui';
import type { Transmission } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * أدوات الكتالوج والتحقق — دوال نقية بس
 *
 * قوايم الماركات والمحافظات نفسها بتيجي من `useCatalog()` في
 * `@carq/api-client` (بديل `GET /v1/catalog/*` — §8.1) — مش من هنا.
 * الملف ده فيه بس اللي مش بيتغيّر مع الباك اند:
 *
 *  · حدود التحقق (`L-3`) متعرّفة مرة واحدة عشان فورم الإضافة
 *    وفورم التعديل والرفع بالجملة يبقوا بنفس القواعد بالظبط.
 *  · تطبيع الأرقام الهندية والنص العربي — إكسل والموبايل بيبعتوهم كتير.
 *  · `resolveFrom` بيحل القيمة الخام مقابل قايمة الكتالوج —
 *    وبيرجع `null` لو مش متحلّلة بدل ما يخمّن.
 * ════════════════════════════════════════════════════════════════
 */

export const PRICE_MIN = 10_000;
export const PRICE_MAX = 100_000_000;
export const YEAR_MIN = 1950;
export const YEAR_MAX = new Date().getFullYear() + 1;
export const KM_MIN = 0;
export const KM_MAX = 2_000_000;

/** ناقل الحركة ثابت في المنتج — مش جزء من كتالوج السيرفر */
export const TRANSMISSIONS: Transmission[] = ['أوتوماتيك', 'مانيوال'];

/* ═══════════════════════ تطبيع النص والأرقام ═══════════════════════ */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * الأرقام الهندية-العربية بتيجي كتير من إكسل والموبايل.
 * بنحوّلها لغربية (0-9) قبل أي حساب — نفس قاعدة العرض (§8).
 */
export function westernDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** تطبيع عربي خفيف: الهمزات والتاء المربوطة والألف المقصورة والتطويل */
function normalizeAr(input: string): string {
  return westernDigits(input)
    .trim()
    .toLowerCase()
    .replace(/ـ/g, '')
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

/**
 * بيحل قيمة خام (من CSV أو من كتابة المستخدم) مقابل قايمة الكتالوج.
 * **بيرجع `null` لو مش متحلّلة** — والواجهة بتعلّمها أصفر وتطلب اختيار،
 * مابتخمّنش. التخمين هنا معناه عربية بماركة غلط في السوق.
 */
export function resolveFrom(list: readonly string[], raw: string): string | null {
  const needle = normalizeAr(raw ?? '');
  if (!needle) return null;
  const exact = list.find((item) => normalizeAr(item) === needle);
  if (exact) return exact;
  const partial = list.find((item) => {
    const hay = normalizeAr(item);
    return hay.startsWith(needle) || needle.startsWith(hay);
  });
  return partial ?? null;
}

/** رقم من حقل نصي — الفاضي بيرجع NaN عشان التحقق يمسكه */
export function toNumber(value: string): number {
  const cleaned = westernDigits(value ?? '').replace(/[^\d-]/g, '');
  return cleaned.length === 0 ? Number.NaN : Number(cleaned);
}

/* ═══════════════════════ حدود L-3 ═══════════════════════ */

export function priceError(value: number): string | undefined {
  if (Number.isNaN(value)) return 'اكتب سعر العربية';
  if (value < PRICE_MIN) return `أقل سعر مسموح بيه ${withThousands(PRICE_MIN)} ج.م`;
  if (value > PRICE_MAX) return `أعلى سعر مسموح بيه ${withThousands(PRICE_MAX)} ج.م`;
  return undefined;
}

export function yearError(value: number): string | undefined {
  if (Number.isNaN(value)) return 'اكتب سنة الموديل';
  if (value < YEAR_MIN || value > YEAR_MAX) return `السنة لازم تكون بين ${YEAR_MIN} و ${YEAR_MAX}`;
  return undefined;
}

export function kmError(value: number): string | undefined {
  if (Number.isNaN(value)) return 'اكتب قراية العداد';
  if (value < KM_MIN) return 'العداد مايكونش بالسالب';
  if (value > KM_MAX) return `أعلى عداد مسموح بيه ${withThousands(KM_MAX)} كم`;
  return undefined;
}

/* ═══════════════════════ التليفون ═══════════════════════ */

/**
 * تليفون مصري صالح: ١١ رقم بيبدأ بـ`01` ومشغّل معروف (0/1/2/5).
 * بنطبّع الأرقام الهندية الأول — اللي بيكتب من الموبايل بيكتبها كتير.
 */
export function isEgyptianPhone(input: string): boolean {
  const digits = westernDigits(input ?? '').replace(/\D/g, '');
  return /^01[0125]\d{8}$/.test(digits);
}
