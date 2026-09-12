import { describe, expect, it } from 'vitest';
import {
  KM_MAX,
  PRICE_MAX,
  PRICE_MIN,
  YEAR_MAX,
  YEAR_MIN,
  isEgyptianPhone,
  kmError,
  priceError,
  resolveFrom,
  toNumber,
  westernDigits,
  yearError,
} from '../catalog';

/**
 * أدوات التحقق دي بتحرس فورم الإضافة والتعديل والرفع بالجملة —
 * نفس حدود السيرفر (L-3) بالظبط، عشان الرفض يحصل قبل الإرسال برسالة
 * مفهومة مش بـ422 مبهم.
 */

describe('westernDigits', () => {
  it('بيحوّل الأرقام العربية-الهندية والفارسية لغربية', () => {
    expect(westernDigits('٧٤٠٠٠٠')).toBe('740000');
    expect(westernDigits('۶۲۰۰۰')).toBe('62000');
  });
  it('النص الغربي بيعدي زي ما هو', () => {
    expect(westernDigits('abc 123')).toBe('abc 123');
  });
});

describe('toNumber', () => {
  it('بيتجاهل الفواصل والمسافات', () => {
    expect(toNumber('1,450,000')).toBe(1450000);
  });
  it('بيقرا الأرقام الهندية', () => {
    expect(toNumber('٨٥٠٬٠٠٠')).toBe(850000);
  });
  it('الفاضي NaN — التحقق هو اللي بيمسكه', () => {
    expect(Number.isNaN(toNumber(''))).toBe(true);
  });
});

describe('resolveFrom — التحليل مقابل الكتالوج', () => {
  const makes = ['تويوتا', 'هيونداي', 'مرسيدس'];

  it('مطابقة حرفية', () => {
    expect(resolveFrom(makes, 'تويوتا')).toBe('تويوتا');
  });

  it('بيطبّع الهمزات والتاء المربوطة والياء', () => {
    // «هيونداى» بياء مقصورة بدل ياء — غلطة إكسل شائعة
    expect(resolveFrom(makes, 'هيونداى')).toBe('هيونداي');
  });

  it('مطابقة جزئية بالبادئة', () => {
    expect(resolveFrom(makes, 'مرسيد')).toBe('مرسيدس');
  });

  it('**بيرجع null لما مش لاقي — عمره ما بيخمّن**', () => {
    expect(resolveFrom(makes, 'لامبورجيني')).toBeNull();
    expect(resolveFrom(makes, '')).toBeNull();
  });
});

describe('حدود L-3', () => {
  it('السعر: 10,000 – 100,000,000', () => {
    expect(priceError(PRICE_MIN)).toBeUndefined();
    expect(priceError(PRICE_MAX)).toBeUndefined();
    expect(priceError(PRICE_MIN - 1)).toBeTruthy();
    expect(priceError(PRICE_MAX + 1)).toBeTruthy();
    expect(priceError(Number.NaN)).toBeTruthy();
  });

  it('السنة: 1950 – السنة الجاية', () => {
    expect(yearError(YEAR_MIN)).toBeUndefined();
    expect(yearError(YEAR_MAX)).toBeUndefined();
    expect(yearError(YEAR_MIN - 1)).toBeTruthy();
    expect(yearError(YEAR_MAX + 1)).toBeTruthy();
  });

  it('العداد: 0 – 2,000,000', () => {
    expect(kmError(0)).toBeUndefined();
    expect(kmError(KM_MAX)).toBeUndefined();
    expect(kmError(-1)).toBeTruthy();
    expect(kmError(KM_MAX + 1)).toBeTruthy();
  });
});

describe('isEgyptianPhone', () => {
  it('المشغلات الأربعة بتعدي', () => {
    for (const p of ['01001234567', '01112345678', '01212345678', '01512345678']) {
      expect(isEgyptianPhone(p)).toBe(true);
    }
  });
  it('بيقبل الأرقام الهندية بعد التطبيع', () => {
    expect(isEgyptianPhone('٠١٠٠١٢٣٤٥٦٧')).toBe(true);
  });
  it('بيرفض المشغل الغلط والطول الغلط', () => {
    expect(isEgyptianPhone('01312345678')).toBe(false);
    expect(isEgyptianPhone('0100123456')).toBe(false);
    expect(isEgyptianPhone('201001234567')).toBe(false);
  });
});
