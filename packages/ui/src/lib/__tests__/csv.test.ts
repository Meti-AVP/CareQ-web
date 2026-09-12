import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell } from '../csv';

/**
 * تصدير CSV بيطلع من داتا مستخدمين (أسماء إعلانات، أوصاف) —
 * الاختبارات دي بتثبّت خطي الحماية: حقن المعادلات والاقتباس.
 */

describe('csvCell — حقن المعادلات', () => {
  it('بيحيّد كل بادئات المعادلات بعلامة اقتباس مفردة', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toContain(`'=`);
    expect(csvCell('+201001234567')).toBe("'+201001234567");
    expect(csvCell('-500')).toBe("'-500");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('النص العادي والأرقام بيعدّوا من غير تغيير', () => {
    expect(csvCell('تويوتا كورولا')).toBe('تويوتا كورولا');
    expect(csvCell(850000)).toBe('850000');
  });

  it('null و undefined بيبقوا خلية فاضية', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('csvCell — الاقتباس', () => {
  it('الفاصلة بتلف الخلية في اقتباس', () => {
    expect(csvCell('القاهرة, مصر')).toBe('"القاهرة, مصر"');
  });
  it('علامة الاقتباس بتتضاعف', () => {
    expect(csvCell('وصف "مميز"')).toBe('"وصف ""مميز"""');
  });
  it('السطر الجديد بيتلف في اقتباس', () => {
    expect(csvCell('سطر\nتاني')).toBe('"سطر\nتاني"');
  });
});

describe('buildCsv', () => {
  it('عناوين ثم صفوف بفواصل', () => {
    const csv = buildCsv(
      ['الماركة', 'السعر'],
      [
        ['تويوتا', 740000],
        ['هيونداي', 620000],
      ],
    );
    expect(csv).toBe('الماركة,السعر\nتويوتا,740000\nهيونداي,620000');
  });

  it('جدول فاضي بيرجع العناوين بس', () => {
    expect(buildCsv(['أ', 'ب'], [])).toBe('أ,ب');
  });

  it('التعقيم شغال جوه الجدول الكامل', () => {
    const csv = buildCsv(['وصف'], [['=2+2']]);
    expect(csv.split('\n')[1]).toBe("'=2+2");
  });
});
