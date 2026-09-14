import { describe, expect, it } from 'vitest';
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, validateFile, validateFileCount } from '../upload';

/**
 * تحقق الملفات الموحّد (المرحلة ٥) — قبل كذا `/apply` بس كانت بتفحص
 * الحجم، وباقي شاشات الرفع (`inventory/new`، `inventory/[id]`، `profile`،
 * الرفع بالجملة) ما كانتش بتفحص حاجة خالص.
 */

function file(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('validateFile', () => {
  it('ملف سليم (حجم ونوع) بيرجّع null', () => {
    expect(validateFile(file('a.jpg', 1000, 'image/jpeg'), { acceptedTypes: ACCEPTED_IMAGE_TYPES })).toBeNull();
  });

  it('ملف أكبر من الحد بيرجّع رسالة عربية', () => {
    const big = file('a.jpg', MAX_UPLOAD_BYTES + 1, 'image/jpeg');
    const error = validateFile(big);
    expect(error).toMatch(/أكبر من/);
  });

  it('نوع غير مقبول بيرجّع رسالة عربية توضّح الصيغ المسموحة', () => {
    const error = validateFile(file('a.exe', 1000, 'application/x-msdownload'), {
      acceptedTypes: ACCEPTED_IMAGE_TYPES,
    });
    expect(error).toMatch(/صيغة الملف/);
  });

  it('بدون acceptedTypes — بيفحص الحجم بس', () => {
    expect(validateFile(file('a.exe', 1000, 'application/x-msdownload'))).toBeNull();
  });
});

describe('validateFileCount', () => {
  it('عدد أقل من أو يساوي الحد — سليم', () => {
    expect(validateFileCount(5, 10)).toBeNull();
    expect(validateFileCount(10, 10)).toBeNull();
  });

  it('عدد أكبر من الحد — رسالة عربية', () => {
    expect(validateFileCount(11, 10)).toMatch(/أقصى عدد/);
  });
});
