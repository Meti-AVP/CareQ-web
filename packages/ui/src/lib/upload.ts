/**
 * ════════════════════════════════════════════════════════════════
 * تحقق ملفات مرفوعة — موحّد (المرحلة ٥، MISSION §5b)
 *
 * قبل كذا: كل شاشة رفع كانت بتفحص (أو مش بتفحص) الحجم لوحدها —
 * `/apply` بس كانت بتفحص الحجم (مش النوع)، و`/inventory/new`،
 * `/inventory/[id]`، `/profile`، وملف CSV الرفع بالجملة مكنوش بيفحصوا
 * حاجة خالص. أي حد من غير امتداد أو بحجم عملاق كان بيعدّي للسيرفر
 * (413 غير متوقّع) أو يتخزّن كملف اسمه بس بلا محتوى حقيقي في الموك.
 *
 * الفحص هنا **قبل الإرسال** فقط — مش بديل عن تحقق السيرفر، لازم يفضل
 * `413`/رفض السيرفر متعامل معاه في `errorMessage()` (X-4) زي أي خطأ تاني.
 * ════════════════════════════════════════════════════════════════
 */

/** ١٠ ميجا — نفس الحد المستخدم في `/apply` أصلًا، عمّمناه لكل الشاشات */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPTED_DOCUMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf'] as const;

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

/** فحص ملف واحد — بيرجّع رسالة عربية جاهزة للعرض، أو `null` لو الملف سليم */
export function validateFile(
  file: File,
  opts: { maxBytes?: number; acceptedTypes?: readonly string[] } = {},
): string | null {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return `الملف أكبر من ${mb(maxBytes)} ميجا — صغّره وارفعه تاني`;
  }
  const acceptedTypes = opts.acceptedTypes;
  if (acceptedTypes && acceptedTypes.length > 0 && !acceptedTypes.includes(file.type)) {
    const isPdfAllowed = acceptedTypes.includes('application/pdf');
    return isPdfAllowed
      ? 'صيغة الملف غير مدعومة — استخدم صورة (JPG/PNG/WEBP) أو PDF'
      : 'صيغة الملف غير مدعومة — استخدم صورة (JPG/PNG/WEBP)';
  }
  return null;
}

/** فحص عدد ملفات مقابل حد أقصى — للمجلد كامل أو رفع متعدد دفعة واحدة */
export function validateFileCount(count: number, max: number): string | null {
  if (count > max) return `أقصى عدد ملفات دفعة واحدة ${max} — قسّمهم على أكتر من مرة`;
  return null;
}
