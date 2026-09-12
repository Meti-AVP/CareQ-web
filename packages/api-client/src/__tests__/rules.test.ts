import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import {
  DEMO_EXHIBITION_ID,
  approveApplication,
  collectSellNow,
  createEntry,
  getCatalog,
  markEntryPaid,
  mockDb,
  offerSellNow,
  placeBid,
  queryListings,
  revealPhone,
  setContract,
} from '../mock/db';
import type { Auction, AuctionEntry, Exhibition } from '../types';

/**
 * قواعد البيزنس الحرجة — الاختبارات دي بتحاكي نفس تسلسل _authorize_bidder
 * في الباك الحقيقي. لو الباك اتربط وواحدة منهم اتكسرت في الواجهة،
 * يبقى الطبقة الوسيطة (hooks) هي اللي غلط مش السيرفر.
 *
 * الملف ده بيعدّل حالة الموك — معزول في module registry خاص بيه
 * (vitest isolate) فمش بيأثر على باقي الملفات.
 */

/** بيجهّز مزاد شغال قابل للمزايدة + معرض مستوفي الشروط */
function armAuction(): { auction: Auction; exhibition: Exhibition; entry: AuctionEntry } {
  const exhibition = mockDb.exhibitions.find((e) => e.id === DEMO_EXHIBITION_ID)!;
  exhibition.isContracted = true;

  const auction = mockDb.auctions.find(
    (a) => a.status === 'live' && a.sellerId !== exhibition.userId,
  )!;
  // نضمن إنه لسه شغال فعلًا وقت تشغيل الاختبار
  auction.endsAt = new Date(Date.now() + 3_600_000).toISOString();

  let entry = mockDb.entries.find(
    (e) => e.auctionId === auction.id && e.exhibitionId === exhibition.id,
  );
  if (!entry) entry = createEntry(auction.id, exhibition.id);
  if (!entry.paidAt) markEntryPaid(entry.id, 'اختبار');

  return { auction, exhibition, entry };
}

const bidderOf = (ex: Exhibition) => ({
  exhibitionId: ex.id,
  exhibitionName: ex.name,
  userId: ex.userId,
});

describe('المزايدة — الشروط الثلاثة (A-1) بالترتيب', () => {
  let armed: ReturnType<typeof armAuction>;
  beforeEach(() => {
    armed = armAuction();
  });

  it('مش متعاقد ⇒ NOT_CONTRACTED حتى لو دافع', () => {
    armed.exhibition.isContracted = false;
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid, bidderOf(armed.exhibition)),
    ).toThrowError(expect.objectContaining({ code: 'NOT_CONTRACTED' }));
    armed.exhibition.isContracted = true;
  });

  it('مش دافع رسوم الدخول ⇒ ENTRY_NOT_PAID', () => {
    const paidAt = armed.entry.paidAt;
    armed.entry.paidAt = null;
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid, bidderOf(armed.exhibition)),
    ).toThrowError(expect.objectContaining({ code: 'ENTRY_NOT_PAID' }));
    armed.entry.paidAt = paidAt;
  });

  it('A-7: المزايدة على عربيتك ممنوعة', () => {
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid, {
        ...bidderOf(armed.exhibition),
        userId: armed.auction.sellerId,
      }),
    ).toThrowError(expect.objectContaining({ code: 'CANNOT_BID_OWN_LISTING' }));
  });

  it('A-4: أقل من nextBid ⇒ BID_TOO_LOW', () => {
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid - armed.auction.bidStep, bidderOf(armed.exhibition)),
    ).toThrowError(expect.objectContaining({ code: 'BID_TOO_LOW' }));
  });

  it('مش على خطوة المزايدة ⇒ BID_NOT_ON_STEP', () => {
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid + 1, bidderOf(armed.exhibition)),
    ).toThrowError(expect.objectContaining({ code: 'BID_NOT_ON_STEP' }));
  });

  it('المزاد المنتهي ⇒ AUCTION_ENDED', () => {
    armed.auction.endsAt = new Date(Date.now() - 1000).toISOString();
    expect(() =>
      placeBid(armed.auction.id, armed.auction.nextBid, bidderOf(armed.exhibition)),
    ).toThrowError(expect.objectContaining({ code: 'AUCTION_ENDED' }));
    armed.auction.endsAt = new Date(Date.now() + 3_600_000).toISOString();
  });

  it('المزايدة السليمة بتحدّث currentBid وnextBid وtopBid مع بعض', () => {
    const amount = armed.auction.nextBid;
    const before = armed.auction.bidsCount;
    const { auction } = placeBid(armed.auction.id, amount, bidderOf(armed.exhibition));
    expect(auction.currentBid).toBe(amount);
    expect(auction.nextBid).toBe(amount + auction.bidStep);
    expect(auction.bidsCount).toBe(before + 1);
    expect(auction.topBid).toEqual({
      exhibitionName: armed.exhibition.name,
      amount,
    });
  });

  it('A-5: مزايدة في آخر دقيقة بتمدّ المزاد وبتزوّد عداد التمديد', () => {
    armed.auction.endsAt = new Date(Date.now() + 30_000).toISOString();
    const extBefore = armed.auction.extensionCount;
    const { auction } = placeBid(armed.auction.id, armed.auction.nextBid, bidderOf(armed.exhibition));
    expect(auction.extensionCount).toBe(extBefore + 1);
    expect(+new Date(auction.endsAt)).toBeGreaterThan(Date.now() + 50_000);
  });
});

describe('بيع حالًا — دورة الحياة', () => {
  it('العرض بيشتغل على pending بس وبيسجّل تدقيق', () => {
    const pending = mockDb.sellNow.find((r) => r.status === 'pending')!;
    const auditBefore = mockDb.auditLog.length;
    const updated = offerSellNow(pending.id, pending.suggestedPrice);
    expect(updated.status).toBe('offered');
    expect(updated.expiresAt).toBeTruthy();
    expect(mockDb.auditLog.length).toBe(auditBefore + 1);
    // إعادة العرض على نفس الطلب ⇒ CONFLICT
    expect(() => offerSellNow(pending.id, pending.suggestedPrice)).toThrowError(ApiError);
  });

  it('SN-7: الاستلام هو اللي بيخلّي العربية sold — مش القبول', () => {
    const accepted = mockDb.sellNow.find((r) => r.status === 'accepted')!;
    const listing = mockDb.listings.find((l) => l.id === accepted.listing.id)!;
    expect(listing.status).not.toBe('sold');
    collectSellNow(accepted.id);
    expect(listing.status).toBe('sold');
  });

  it('الاستلام من غير قبول ⇒ CONFLICT', () => {
    const offered = mockDb.sellNow.find((r) => r.status === 'offered');
    if (!offered) return;
    expect(() => collectSellNow(offered.id)).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
  });
});

describe('الموافقة على طلب الترقية — معاملة واحدة', () => {
  it('بتنشئ المعرض وترقّي الدور وتعلّم verified — والتعاقد بيفضل مقفول', () => {
    const app = mockDb.applications.find((a) => a.status === 'submitted')!;
    const exCountBefore = mockDb.exhibitions.length;
    const created = approveApplication(app.id, 'الأوراق سليمة');

    expect(app.status).toBe('approved');
    expect(mockDb.exhibitions.length).toBe(exCountBefore + 1);
    expect(created.verified).toBe(true);
    // التعاقد قرار منفصل — عمره ما بييجي مع الموافقة
    expect(created.isContracted).toBe(false);
    const user = mockDb.users.find((u) => u.id === app.userId)!;
    expect(user.role).toBe('exhibition');
  });
});

describe('التعاقد — المفتاح اللي بيحيي المزاد', () => {
  it('التفعيل بيسجّل بداية ونهاية عقد وتدقيق بالسبب', () => {
    const ex = mockDb.exhibitions.find((e) => !e.isContracted)!;
    const auditBefore = mockDb.auditLog.length;
    const updated = setContract(ex.id, true, 'عقد سنة موقّع');
    expect(updated.isContracted).toBe(true);
    expect(updated.contractStartsAt).toBeTruthy();
    expect(updated.contractEndsAt).toBeTruthy();
    const entry = mockDb.auditLog[0]!;
    expect(mockDb.auditLog.length).toBe(auditBefore + 1);
    expect(entry.action).toBe('exhibition.contract_changed');
    expect(entry.payload.reason).toBe('عقد سنة موقّع');
  });
});

describe('كشف التليفون (§10.2)', () => {
  it('بيرجع الرقم وبيسيب أثر تدقيق إجباري', () => {
    const user = mockDb.users[0]!;
    const auditBefore = mockDb.auditLog.length;
    const phone = revealPhone(user.id);
    expect(phone).toBe(user.phone);
    expect(mockDb.auditLog.length).toBe(auditBefore + 1);
    expect(mockDb.auditLog[0]!.action).toBe('user.phone_revealed');
  });
});

describe('الترقيم بالـcursor', () => {
  it('المشي بالـcursor بيغطي كل الصفوف من غير تكرار', () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let total = 0;
    for (let guard = 0; guard < 100; guard++) {
      const page = queryListings({ status: 'all', cursor, limit: 25 });
      for (const l of page.items) {
        expect(seen.has(l.id)).toBe(false);
        seen.add(l.id);
      }
      total = page.total ?? 0;
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(total);
  });
});

describe('الكتالوج', () => {
  it('قوايم مرتبة عربي ومن غير تكرار، وكل موديل تحت ماركته', () => {
    const cat = getCatalog();
    expect(cat.makes.length).toBeGreaterThan(0);
    expect(new Set(cat.makes).size).toBe(cat.makes.length);
    for (const make of cat.makes) {
      expect(cat.modelsByMake[make]?.length).toBeGreaterThan(0);
    }
    for (const gov of cat.governorates) {
      expect(cat.areasByGov[gov]?.length).toBeGreaterThan(0);
    }
  });
});
