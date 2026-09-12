/**
 * ════════════════════════════════════════════════════════════════
 * تصدير CSV آمن — النقطة الوحيدة اللي بتبني ملفات التصدير
 *
 * خليتين حماية إجباريتين على كل خلية:
 *
 *  ١) **حقن المعادلات:** الخلية اللي بتبدأ بـ `=` أو `+` أو `-` أو
 *     `@` أو tab بيعاملها إكسل كمعادلة تنفيذية. وصف إعلان مكتوب فيه
 *     `=HYPERLINK(...)` بيتنفذ على جهاز الأدمن أول ما يفتح التصدير.
 *     العلاج المتفق عليه: بادئة `'` — إكسل بيعرضها نص عادي.
 *
 *  ٢) **الاقتباس:** أي خلية فيها فاصلة أو سطر جديد أو علامة اقتباس
 *     بتتلف في `"…"` مع مضاعفة الاقتباسات — من غيرها الأعمدة بتتلخبط.
 *
 * والـBOM في أول الملف إجباري — من غيره إكسل بيفتح العربي حروف مكسّرة.
 * ════════════════════════════════════════════════════════════════
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/** خلية واحدة: تعقيم المعادلات ثم الاقتباس */
export function csvCell(raw: unknown): string {
  let s = raw === null || raw === undefined ? '' : String(raw);
  if (s.length > 0 && FORMULA_TRIGGERS.includes(s[0]!)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** جدول كامل: صف العناوين ثم الصفوف — كل الخلايا معقّمة */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const head = headers.map(csvCell).join(',');
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return body.length > 0 ? `${head}\n${body}` : head;
}

/** تنزيل في المتصفح — بيضيف BOM وبينضف الـobject URL بعده */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
