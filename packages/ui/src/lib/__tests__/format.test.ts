import { describe, expect, it } from 'vitest';
import {
  compactEGP,
  compactNumber,
  formatCountdown,
  formatEGP,
  formatKm,
  formatPct,
  formatPhone,
  maskPhone,
  withThousands,
} from '../format';

/**
 * الفورماتر منقول من الموبايل — الاختبارات دي بتثبّت العقد:
 * أرقام غربية بفواصل آلاف (§8)، وإخفاء التليفون بصيغة «010 ••• 553».
 */

describe('withThousands', () => {
  it('بيفصل الآلاف بفواصل وبأرقام غربية', () => {
    expect(withThousands(0)).toBe('0');
    expect(withThousands(999)).toBe('999');
    expect(withThousands(1000)).toBe('1,000');
    expect(withThousands(1450000)).toBe('1,450,000');
    expect(withThousands(100_000_000)).toBe('100,000,000');
  });

  it('بيقرّب الكسور — فلوس المنتج أعداد صحيحة (X-1)', () => {
    expect(withThousands(1234.6)).toBe('1,235');
  });

  it('مفيش أرقام عربية-هندية في الناتج أبدًا', () => {
    for (const v of [7, 1234, 987654321]) {
      expect(withThousands(v)).not.toMatch(/[٠-٩]/);
    }
  });
});

describe('formatEGP / formatKm', () => {
  it('بيلحق الوحدة بعد الرقم', () => {
    expect(formatEGP(850000)).toBe('850,000 ج.م');
    expect(formatKm(62000)).toBe('62,000 كم');
  });
});

describe('compactEGP', () => {
  it('مليون فأكتر بصيغة «X مليون ج.م»', () => {
    expect(compactEGP(1_000_000)).toBe('1 مليون ج.م');
    expect(compactEGP(1_450_000)).toBe('1.45 مليون ج.م');
  });
  it('آلاف بصيغة «X ألف ج.م»', () => {
    expect(compactEGP(850_000)).toBe('850 ألف ج.م');
  });
  it('أقل من ألف زي ما هو', () => {
    expect(compactEGP(500)).toBe('500 ج.م');
  });
});

describe('compactNumber', () => {
  it('بيختصر من غير عملة', () => {
    expect(compactNumber(2_500_000)).toBe('2.5 مليون');
    expect(compactNumber(75_000)).toBe('75 ألف');
    expect(compactNumber(950)).toBe('950');
  });
});

describe('formatPct', () => {
  it('الموجب بياخد إشارة + والسالب بإشارته', () => {
    expect(formatPct(12.3)).toBe('+12.3٪');
    expect(formatPct(-8, 0)).toBe('-8٪');
  });
});

describe('formatCountdown', () => {
  it('دقايق:ثواني تحت الساعة', () => {
    expect(formatCountdown(252)).toBe('04:12');
  });
  it('ساعات:دقايق:ثواني فوق الساعة', () => {
    expect(formatCountdown(3852)).toBe('01:04:12');
  });
  it('السالب بيتقفل على صفر — مفيش عداد بالسالب', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('maskPhone — §10.2', () => {
  it('بيسيب أول ٣ وآخر ٣ أرقام بس', () => {
    expect(maskPhone('01001234553')).toBe('010 ••• 553');
  });
  it('الرقم الكامل مش موجود في الناتج', () => {
    expect(maskPhone('01001234553')).not.toContain('01234');
  });
  it('الأرقام القصيرة بتتخفي بالكامل', () => {
    expect(maskPhone('12345')).toBe('•••');
  });
});

describe('formatPhone', () => {
  it('بيقسم 3-4-4 للرقم المصري', () => {
    expect(formatPhone('01001234553')).toBe('010 0123 4553');
  });
  it('غير الـ١١ رقم بيرجع زي ما هو', () => {
    expect(formatPhone('123')).toBe('123');
  });
});
