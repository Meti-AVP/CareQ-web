/**
 * الفورماتر — منقول من `src/lib/format.ts` بتاع الموبايل عشان الرقم
 * يتكتب بنفس الشكل بالظبط في التطبيق والويب.
 *
 * الأرقام هندية غربية (0-9) بفواصل آلاف (ADMIN_DASHBOARD_SPEC §8):
 * الأرقام العربية-الهندية بتكسر النسخ واللصق من الجداول والتصدير.
 */

export function withThousands(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatEGP(value: number): string {
  return `${withThousands(value)} ج.م`;
}

export function formatKm(value: number): string {
  return `${withThousands(value)} كم`;
}

/** 1450000 → «1.45 مليون ج.م» — للبلاطات والعناوين الضيقة */
export function compactEGP(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000;
    const s = m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/0$/, '');
    return `${s} مليون ج.م`;
  }
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} ألف ج.م`;
  return `${value} ج.م`;
}

/** 1450000 → «1.45 مليون» — من غير عملة، للمحاور */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)} مليون`;
  }
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} ألف`;
  return withThousands(value);
}

/** نسبة مئوية بإشارة — للدلتا في بلاطات الـKPI */
export function formatPct(value: number, digits = 1): string {
  const s = value.toFixed(digits).replace(/\.0$/, '');
  return `${value > 0 ? '+' : ''}${s}٪`;
}

export function formatPctPlain(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(/\.0$/, '')}٪`;
}

/** مدة بالثواني → «04:12» أو «01:04:12» — عدادات المزاد */
export function formatCountdown(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * رقم تليفون مخفي جزئيًا (ADMIN_DASHBOARD_SPEC §10.2).
 * 01001234553 → «010 ••• 553»
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '•••';
  return `${digits.slice(0, 3)} ••• ${digits.slice(-3)}`;
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length !== 11) return phone;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
}
