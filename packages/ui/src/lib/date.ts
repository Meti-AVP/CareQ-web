/**
 * التواريخ — كلها بتوقيت `Africa/Cairo` إجباريًا (ADMIN_DASHBOARD_SPEC §8).
 *
 * ليه إجباري: مصر رجّعت التوقيت الصيفي من ٢٠٢٣، فالإزاحة عن UTC
 * **مش ثابتة**. أي تجميع يومي بتوقيت المتصفح هيحط عمليات الساعة ١ صباحًا
 * في اليوم الغلط مرتين في السنة — والأرقام دي بتتحول قرارات فلوس.
 */
import { differenceInSeconds } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export const CAIRO_TZ = 'Africa/Cairo';

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function toDate(input: string | number | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

/** «١٢ سبتمبر ٢٠٢٦» — بأرقام غربية: «12 سبتمبر 2026» */
export function formatDateAr(input: string | number | Date): string {
  const d = toDate(input);
  const day = formatInTimeZone(d, CAIRO_TZ, 'd');
  const monthIdx = Number(formatInTimeZone(d, CAIRO_TZ, 'M')) - 1;
  const year = formatInTimeZone(d, CAIRO_TZ, 'yyyy');
  return `${day} ${AR_MONTHS[monthIdx]} ${year}`;
}

/** «12 سبتمبر 2026 · 3:45 م» */
export function formatDateTimeAr(input: string | number | Date): string {
  const d = toDate(input);
  const h24 = Number(formatInTimeZone(d, CAIRO_TZ, 'H'));
  const minute = formatInTimeZone(d, CAIRO_TZ, 'mm');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${formatDateAr(d)} · ${h12}:${minute} ${h24 < 12 ? 'ص' : 'م'}`;
}

/** «3:45 م» */
export function formatTimeAr(input: string | number | Date): string {
  const d = toDate(input);
  const h24 = Number(formatInTimeZone(d, CAIRO_TZ, 'H'));
  const minute = formatInTimeZone(d, CAIRO_TZ, 'mm');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${minute} ${h24 < 12 ? 'ص' : 'م'}`;
}

/** مفتاح اليوم للتجميع — بتوقيت القاهرة مش UTC */
export function cairoDayKey(input: string | number | Date): string {
  return formatInTimeZone(toDate(input), CAIRO_TZ, 'yyyy-MM-dd');
}

/** تسمية محور مختصرة: «12 سبت» */
export function axisDayLabel(input: string | number | Date): string {
  const d = toDate(input);
  const day = formatInTimeZone(d, CAIRO_TZ, 'd');
  const monthIdx = Number(formatInTimeZone(d, CAIRO_TZ, 'M')) - 1;
  return `${day} ${AR_MONTHS[monthIdx].slice(0, 4)}`;
}

/** «من ساعتين» · «من 3 أيام» — نفس صياغة relTimeAr في الموبايل */
export function relTimeAr(input: string | number | Date, now: Date = new Date()): string {
  const seconds = differenceInSeconds(now, toDate(input));
  if (seconds < 60) return 'الآن';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const h = Math.round(minutes / 60);
  if (h < 24) {
    if (h === 1) return 'من ساعة';
    if (h === 2) return 'من ساعتين';
    return h <= 10 ? `من ${h} ساعات` : `من ${h} ساعة`;
  }
  const d = Math.round(h / 24);
  if (d === 1) return 'أمس';
  if (d === 2) return 'من يومين';
  return d <= 10 ? `من ${d} أيام` : `من ${d} يوم`;
}

/** مدة انتظار مضغوطة للأعمدة: «3 س» · «2 ي» */
export function waitingFor(input: string | number | Date, now: Date = new Date()): string {
  const seconds = differenceInSeconds(now, toDate(input));
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(seconds / 60))} د`;
  if (h < 24) return `${Math.round(h)} س`;
  return `${Math.round(h / 24)} ي`;
}

/** ساعات الانتظار — للتلوين بعتبة الـSLA (٢٤ ساعة) */
export function hoursSince(input: string | number | Date, now: Date = new Date()): number {
  return differenceInSeconds(now, toDate(input)) / 3600;
}

/** ثواني متبقية لنهاية المزاد — دايمًا من endsAt بتاع السيرفر (A-6) */
export function secondsUntil(input: string | number | Date, now: Date = new Date()): number {
  return Math.max(0, differenceInSeconds(toDate(input), now));
}
