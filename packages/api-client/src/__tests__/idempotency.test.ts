import { describe, expect, it } from 'vitest';
import { IdempotencyKeyCache, idempotencyKey } from '../client';

/**
 * `IdempotencyKeyCache` — إصلاح المرحلة ٥ (X-3): `idempotencyKey()` الخام
 * بترجّع مفتاح عشوائي جديد مع كل نداء، وكانت بتُنادى **جوه** `mutationFn`
 * في كل الـmutations اللي بتحتاج idempotency — يعني إعادة محاولة (فشل
 * شبكة، دوسة تانية سريعة) بتاخد مفتاح مختلف، فالعملية بتتنفّذ مرتين
 * بالظبط اللي الـidempotency موجودة عشان تمنعه.
 */

describe('idempotencyKey — الدالة الخام', () => {
  it('بترجّع مفتاح مختلف مع كل نداء (السلوك المتوقّع منها لوحدها)', () => {
    const a = idempotencyKey('sold-l-1');
    const b = idempotencyKey('sold-l-1');
    expect(a).not.toBe(b);
  });
});

describe('IdempotencyKeyCache — المفتاح الثابت عبر إعادة المحاولة', () => {
  it('بترجّع نفس المفتاح لنفس العملية المنطقية طول ما لسه معلّقة', () => {
    const cache = new IdempotencyKeyCache('sold');
    const first = cache.get('l-1');
    const retry = cache.get('l-1');
    expect(retry).toBe(first);
  });

  it('بعد clear() — نفس id بترجّع مفتاح جديد (عملية منطقية جديدة)', () => {
    const cache = new IdempotencyKeyCache('sold');
    const first = cache.get('l-1');
    cache.clear('l-1');
    const next = cache.get('l-1');
    expect(next).not.toBe(first);
  });

  it('عمليتين مختلفتين (id مختلف) بياخدوا مفاتيح مختلفة من غير تصادم', () => {
    const cache = new IdempotencyKeyCache('bid');
    const a = cache.get('auc-1:150000');
    const b = cache.get('auc-1:160000'); // مبلغ مزايدة مختلف = عملية جديدة
    expect(a).not.toBe(b);
    // وclear لواحدة مايأثرش على التانية
    cache.clear('auc-1:150000');
    expect(cache.get('auc-1:160000')).toBe(b);
  });

  it('المفتاح بيبدأ بالـprefix عشان يتفرّق في الـلوج عن باقي الأنواع', () => {
    const cache = new IdempotencyKeyCache('reactivate');
    expect(cache.get('l-9')).toMatch(/^reactivate-l-9-/);
  });
});
