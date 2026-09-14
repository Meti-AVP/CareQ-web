import { describe, expect, it } from 'vitest';
import { can, bidBlockCode, BID_BLOCK_LABEL_AR, BID_BLOCK_HINT_AR } from '../permissions';

/**
 * نموذج الصلاحيات المركزي — المرحلة ٣ (docs/PERMISSIONS.md).
 * كل الأكشنات الإدارية دلوقتي محصورة على role==='admin' بس؛ شروط
 * المزايدة الثلاثة (bidBlockCode) مستخدمة من اللوحتين.
 */

describe('can — الأكشنات الإدارية', () => {
  it('أدمن مسموح له بكل الأكشنات', () => {
    const admin = { role: 'admin' as const };
    expect(can(admin, 'exhibition.contract.set')).toBe(true);
    expect(can(admin, 'exhibition.application.review')).toBe(true);
    expect(can(admin, 'user.role.set')).toBe(true);
    expect(can(admin, 'user.status.set')).toBe(true);
    expect(can(admin, 'auction.mark_defaulted')).toBe(true);
    expect(can(admin, 'auction.entry.mark_paid')).toBe(true);
    expect(can(admin, 'listing.flags.set')).toBe(true);
  });

  it('معرض أو فرد ممنوع من كل الأكشنات الإدارية', () => {
    expect(can({ role: 'exhibition' }, 'exhibition.contract.set')).toBe(false);
    expect(can({ role: 'individual' }, 'user.role.set')).toBe(false);
  });

  it('مفيش مستخدم (null/undefined) = ممنوع', () => {
    expect(can(null, 'exhibition.contract.set')).toBe(false);
    expect(can(undefined, 'exhibition.contract.set')).toBe(false);
  });
});

describe('bidBlockCode — الشروط الثلاثة للمزايدة (A-1)', () => {
  it('الشروط الثلاثة كاملة ⇒ null (مسموح يزايد)', () => {
    expect(bidBlockCode({ role: true, contracted: true, entryPaid: true })).toBeNull();
  });

  it('الدور مش exhibition ⇒ NOT_AN_EXHIBITION (أول شرط بيتفحص)', () => {
    expect(bidBlockCode({ role: false, contracted: true, entryPaid: true })).toBe(
      'NOT_AN_EXHIBITION',
    );
  });

  it('مش متعاقد ⇒ NOT_CONTRACTED حتى لو الدفع تمام', () => {
    expect(bidBlockCode({ role: true, contracted: false, entryPaid: true })).toBe(
      'NOT_CONTRACTED',
    );
  });

  it('متعاقد بس مش مدفوع ⇒ ENTRY_NOT_PAID', () => {
    expect(bidBlockCode({ role: true, contracted: true, entryPaid: false })).toBe(
      'ENTRY_NOT_PAID',
    );
    expect(bidBlockCode({ role: true, contracted: true, entryPaid: null })).toBe(
      'ENTRY_NOT_PAID',
    );
  });

  it('role=null (بيانات لسه بتحمّل) بيتعامل زي true — مايوقفش على شرط الدور', () => {
    // role: null يعني "لسه مش معروف"، مش "false" — أول شرط فاشل فعليًا
    // بيبقى التاني (contracted) لو مش متعاقد
    expect(bidBlockCode({ role: null, contracted: false, entryPaid: true })).toBe(
      'NOT_CONTRACTED',
    );
  });

  it('كل كود ليه رسالة ولمحة عربية جاهزة للعرض', () => {
    for (const code of ['NOT_AN_EXHIBITION', 'NOT_CONTRACTED', 'ENTRY_NOT_PAID'] as const) {
      expect(BID_BLOCK_LABEL_AR[code]).toBeTruthy();
      expect(BID_BLOCK_HINT_AR[code]).toBeTruthy();
    }
  });
});
