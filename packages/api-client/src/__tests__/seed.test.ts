import { describe, expect, it } from 'vitest';
import { mockDb } from '../mock/db';

/**
 * سلامة داتا الموك — الداتا دي هي «الباك اند» لحد ما الحقيقي يتربط،
 * فلو فيها كسر في قاعدة بيزنس، كل الشاشات هتتعلم الغلط.
 */

const ALL_STRINGS = (): string[] => {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(mockDb);
  return out;
};

describe('هوية المنتج', () => {
  it('ولا سلسلة واحدة في الداتا فيها إيموجي — قرار هوية', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    const offenders = ALL_STRINGS().filter((s) => emoji.test(s));
    expect(offenders).toEqual([]);
  });
});

describe('الفلوس والأرقام (X-1)', () => {
  it('كل الأسعار أعداد صحيحة — مفيش كسور فلوس', () => {
    for (const l of mockDb.listings) {
      expect(Number.isInteger(l.price)).toBe(true);
      if (l.marketAvg !== null) expect(Number.isInteger(l.marketAvg)).toBe(true);
    }
    for (const a of mockDb.auctions) {
      expect(Number.isInteger(a.startPrice)).toBe(true);
      expect(Number.isInteger(a.currentBid)).toBe(true);
      expect(Number.isInteger(a.nextBid)).toBe(true);
    }
  });

  it('حدود L-3 محترمة في كل الإعلانات', () => {
    const yearMax = new Date().getFullYear() + 1;
    for (const l of mockDb.listings) {
      expect(l.price).toBeGreaterThanOrEqual(10_000);
      expect(l.price).toBeLessThanOrEqual(100_000_000);
      expect(l.year).toBeGreaterThanOrEqual(1950);
      expect(l.year).toBeLessThanOrEqual(yearMax);
      expect(l.km).toBeGreaterThanOrEqual(0);
      expect(l.km).toBeLessThanOrEqual(2_000_000);
    }
  });
});

describe('قواعد المزادات', () => {
  it('A-2: سعر البداية ٨٥٪ من سعر الإعلان (مقرّب لأقرب ألف)', () => {
    for (const a of mockDb.auctions) {
      const listing = mockDb.listings.find((l) => l.id === a.listing.id);
      if (!listing) continue;
      expect(a.startPrice).toBe(Math.round((listing.price * 0.85) / 1000) * 1000);
    }
  });

  it('A-3: nextBid = currentBid + bidStep دايمًا', () => {
    for (const a of mockDb.auctions) {
      expect(a.nextBid).toBe(a.currentBid + a.bidStep);
    }
  });

  it('§6.3: topBid مضمّن ومتسق مع جدول المزايدات', () => {
    for (const a of mockDb.auctions) {
      const bids = mockDb.bids.filter((b) => b.auctionId === a.id);
      if (bids.length === 0) {
        expect(a.topBid).toBeNull();
      } else {
        const top = bids.reduce((m, b) => (b.amount > m.amount ? b : m));
        expect(a.topBid).not.toBeNull();
        expect(a.topBid!.amount).toBe(top.amount);
        expect(a.topBid!.exhibitionName).toBe(top.exhibitionName);
        expect(a.currentBid).toBe(top.amount);
      }
    }
  });

  it('A-5: التمديد المضاد للقنص ماتعدّاش الحد الأقصى ٢٠', () => {
    for (const a of mockDb.auctions) {
      expect(a.extensionCount).toBeLessThanOrEqual(20);
    }
  });

  it('المزايدات كلها من معارض متعاقدة (A-1)', () => {
    const contracted = new Set(mockDb.exhibitions.filter((e) => e.isContracted).map((e) => e.id));
    for (const b of mockDb.bids) {
      expect(contracted.has(b.bidderId)).toBe(true);
    }
  });
});

describe('بيع حالًا (SN)', () => {
  it('SN-1: السعر المقترح ٩١٪ من سعر الإعلان', () => {
    for (const r of mockDb.sellNow) {
      const listing = mockDb.listings.find((l) => l.id === r.listing.id);
      if (!listing) continue;
      expect(r.suggestedPrice).toBe(Math.round((listing.price * 0.91) / 1000) * 1000);
    }
  });
});

describe('التليفونات', () => {
  it('كل تليفونات المستخدمين مصرية صالحة', () => {
    for (const u of mockDb.users) {
      expect(u.phone.replace(/\D/g, '')).toMatch(/^01[0125]\d{8}$/);
    }
  });
});

describe('P-4: مش متسعّر يعني null مش صفر', () => {
  it('marketAvg إما null أو رقم موجب — عمره ما صفر', () => {
    for (const l of mockDb.listings) {
      if (l.marketAvg !== null) expect(l.marketAvg).toBeGreaterThan(0);
    }
  });
  it('فيه إعلانات نشطة مش متسعّرة فعلًا — الحالة دي لازم تتراجع في الواجهة', () => {
    const unpriced = mockDb.listings.filter((l) => l.status === 'active' && l.marketAvg === null);
    expect(unpriced.length).toBeGreaterThan(0);
  });
});

describe('التدقيق (X-6)', () => {
  it('كل صف تدقيق فيه فاعل وأكشن وكيان وتوقيت', () => {
    for (const e of mockDb.auditLog) {
      expect(e.actorId).toBeTruthy();
      expect(e.action).toBeTruthy();
      expect(e.entityType).toBeTruthy();
      expect(e.entityId).toBeTruthy();
      expect(Number.isNaN(+new Date(e.createdAt))).toBe(false);
    }
  });
});
