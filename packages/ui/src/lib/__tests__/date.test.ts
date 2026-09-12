import { describe, expect, it } from 'vitest';
import {
  cairoDayKey,
  formatDateAr,
  formatDateTimeAr,
  hoursSince,
  relTimeAr,
  secondsUntil,
  waitingFor,
} from '../date';

/**
 * كل التواريخ بتوقيت القاهرة إجباريًا (§8) — مصر رجّعت التوقيت
 * الصيفي من ٢٠٢٣ فالإزاحة مش ثابتة. الاختبارات بتثبّت إن التجميع
 * اليومي بيحصل على يوم القاهرة مش يوم UTC.
 */

describe('cairoDayKey — X-2', () => {
  it('عملية الساعة ١ صباحًا بتوقيت مصر بتتحسب على يومها المصري مش UTC', () => {
    // 2026-01-14T23:30:00Z == 2026-01-15 01:30 بتوقيت القاهرة (شتاء +02)
    expect(cairoDayKey('2026-01-14T23:30:00Z')).toBe('2026-01-15');
  });

  it('وفي الصيف الإزاحة +03', () => {
    // 2026-07-14T21:30:00Z == 2026-07-15 00:30 بتوقيت القاهرة (صيف +03)
    expect(cairoDayKey('2026-07-14T21:30:00Z')).toBe('2026-07-15');
  });
});

describe('formatDateAr', () => {
  it('«يوم شهر سنة» بأرقام غربية وشهر عربي', () => {
    expect(formatDateAr('2026-09-11T12:00:00Z')).toBe('11 سبتمبر 2026');
  });
});

describe('formatDateTimeAr', () => {
  it('بيلحق الوقت بصيغة ١٢ ساعة ص/م', () => {
    // 12:00Z في سبتمبر == 15:00 القاهرة
    expect(formatDateTimeAr('2026-09-11T12:00:00Z')).toBe('11 سبتمبر 2026 · 3:00 م');
  });
});

describe('relTimeAr', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  it('تحت الدقيقة «الآن»', () => {
    expect(relTimeAr('2026-09-11T11:59:30Z', now)).toBe('الآن');
  });
  it('مثنى الساعات صياغة عربية سليمة', () => {
    expect(relTimeAr('2026-09-11T10:00:00Z', now)).toBe('من ساعتين');
  });
  it('إمبارح «أمس»', () => {
    expect(relTimeAr('2026-09-10T11:00:00Z', now)).toBe('أمس');
  });
  it('فوق العشرة «يوم» مش «أيام»', () => {
    expect(relTimeAr('2026-08-27T12:00:00Z', now)).toBe('من 15 يوم');
  });
});

describe('waitingFor', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  it('دقايق ثم ساعات ثم أيام', () => {
    expect(waitingFor('2026-09-11T11:40:00Z', now)).toBe('20 د');
    expect(waitingFor('2026-09-11T09:00:00Z', now)).toBe('3 س');
    expect(waitingFor('2026-09-08T12:00:00Z', now)).toBe('3 ي');
  });
});

describe('hoursSince / secondsUntil', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  it('hoursSince بيرجع ساعات عشرية', () => {
    expect(hoursSince('2026-09-11T09:00:00Z', now)).toBe(3);
  });
  it('secondsUntil مابيرجعش سالب — العدادات بتقف على صفر', () => {
    expect(secondsUntil('2026-09-11T11:00:00Z', now)).toBe(0);
    expect(secondsUntil('2026-09-11T12:01:00Z', now)).toBe(60);
  });
});
