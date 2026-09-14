/**
 * قاعدة بيانات الموك في الذاكرة.
 *
 * بتقلّد الباك اند الحقيقي في التفاصيل اللي بتفرق:
 *  · تقسيم الصفحات بالـcursor (مش قص محلي)
 *  · **كل أكشن كتابة بيسجّل صف تدقيق** (X-8) — زي الباك بالظبط
 *  · انتقالات الحالة بقواعدها (SN-7: accepted → reserved مش sold)
 *  · التجميع الزمني **بتوقيت القاهرة** (X-2)
 *  · الأيام الفاضية بترجع بصفر مش محذوفة
 *
 * لما الباك يجهز، الملف ده بيتشال والـhooks بتنادي `http()` — والشاشات
 * ماتتغيرش، لأنها بتشوف نفس الأنواع في الحالتين.
 */
import type {
  AdminActivityCell,
  ApplicationStatus,
  Auction,
  AuctionBid,
  AuctionEntry,
  AuditAction,
  AuditEntry,
  BreakdownBucket,
  BreakdownDimension,
  Catalog,
  ChatMessage,
  ChatThread,
  DownTier,
  Exhibition,
  ExhibitionApplication,
  ExhibitionStats,
  FinancingApplication,
  FinancingStatus,
  HealthSnapshot,
  Listing,
  ListingStatus,
  OverviewStats,
  Page,
  ScanJob,
  SellNowRequest,
  SignedImageUrl,
  StatsFilters,
  TimeseriesMetric,
  TimeseriesPoint,
  Transmission,
  User,
  UserRole,
  UserStatus,
} from '../types';
import { ApiError } from '../errors';
import { emitMockRealtimeEvent } from '../realtime';
import { seed, ADMIN_USER, MOCK_NOW } from './seed';

/**
 * بتوقيت القاهرة إجباريًا لأي تجميع/فلترة بالتاريخ (X-2) — مصر بترجّع
 * الصيفي من ٢٠٢٣، فالإزاحة عن UTC مش ثابتة. بنحسبها بـ`Intl` المدمجة
 * بدل مكتبة خارجية (`date-fns-tz` بطيئة التحميل جوه Vitest — لاحظنا
 * timeout حقيقي في `session.test.ts` أول ما اتضافت كـdependency جديدة).
 */
const CAIRO_TZ = 'Africa/Cairo';

/** إزاحة القاهرة عن UTC بالدقايق في لحظة معيّنة (١٢٠ شتوي / ١٨٠ صيفي) */
function cairoOffsetMinutes(utcGuess: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CAIRO_TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(utcGuess)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcGuess.getTime()) / 60_000;
}

/** "yyyy-MM-ddTHH:mm:ss" (وقت حائط بتوقيت القاهرة) → لحظة UTC حقيقية */
function cairoWallTimeToMs(isoLocal: string): number {
  const guess = new Date(`${isoLocal}Z`);
  return guess.getTime() - cairoOffsetMinutes(guess) * 60_000;
}

/* ═══════════════════════ الحالة ═══════════════════════ */

const db = {
  users: [...seed.users],
  exhibitions: [...seed.exhibitions],
  listings: [...seed.listings],
  sellNow: [...seed.sellNow],
  auctions: [...seed.auctions],
  bids: [...seed.bids],
  entries: [...seed.entries],
  applications: [...seed.applications],
  financing: [...seed.financing],
  scanJobs: [...seed.scanJobs],
  auditLog: [...seed.auditLog],
  chats: [...seed.chats],
  chatMessages: [...seed.chatMessages],
};

export type MockDb = typeof db;
export const mockDb = db;

/** تأخير شبكة واقعي — عشان حالات التحميل تتشاف فعلًا في الديمو */
export const latency = (ms = 260) => new Promise((r) => setTimeout(r, ms));

const DAY = 86_400_000;

/* ═══════════════════════ التدقيق ═══════════════════════ */

/** كل أكشن كتابة بيسيب أثر — مفيش استثناء (X-8) */
function audit(
  action: AuditAction,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
): void {
  db.auditLog.unshift({
    id: `au-live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actorId: ADMIN_USER.id,
    actorName: ADMIN_USER.name,
    action,
    entityType,
    entityId,
    payload,
    createdAt: new Date().toISOString(),
  });
}

/* ═══════════════════════ أدوات ═══════════════════════ */

function paginate<T>(rows: T[], cursor?: string | null, limit = 25): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const slice = rows.slice(start, start + limit);
  const next = start + limit < rows.length ? String(start + limit) : null;
  return { items: slice, nextCursor: next, total: rows.length };
}

const asTime = (v: string | null) => (v ? +new Date(v) : 0);
const contains = (hay: string | null | undefined, needle: string) =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

/** مفتاح يوم بتوقيت القاهرة — مش UTC (X-2) */
function cairoKey(isoStr: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoStr));
}

/* ═══════════════════════ الإعلانات ═══════════════════════ */

export interface ListingQuery {
  status?: ListingStatus | 'all';
  make?: string;
  governorate?: string;
  q?: string;
  hasPhotos?: boolean;
  priced?: boolean;
  kmVerified?: boolean;
  inspected?: boolean;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  sellerId?: string;
  cursor?: string | null;
  limit?: number;
}

export function queryListings(q: ListingQuery = {}): Page<Listing> {
  let rows = db.listings;
  if (q.status && q.status !== 'all') rows = rows.filter((l) => l.status === q.status);
  if (q.make) rows = rows.filter((l) => l.make === q.make);
  if (q.governorate) rows = rows.filter((l) => l.governorate === q.governorate);
  if (q.sellerId) rows = rows.filter((l) => l.seller.id === q.sellerId);
  if (q.hasPhotos !== undefined)
    rows = rows.filter((l) => (q.hasPhotos ? l.photosCount > 0 : l.photosCount === 0));
  if (q.priced !== undefined)
    rows = rows.filter((l) => (q.priced ? l.marketAvg !== null : l.marketAvg === null));
  if (q.kmVerified !== undefined) rows = rows.filter((l) => l.kmVerified === q.kmVerified);
  if (q.inspected !== undefined) rows = rows.filter((l) => l.inspected === q.inspected);
  if (q.priceMin !== undefined) rows = rows.filter((l) => l.price >= q.priceMin!);
  if (q.priceMax !== undefined) rows = rows.filter((l) => l.price <= q.priceMax!);
  if (q.yearMin !== undefined) rows = rows.filter((l) => l.year >= q.yearMin!);
  if (q.yearMax !== undefined) rows = rows.filter((l) => l.year <= q.yearMax!);
  if (q.q)
    rows = rows.filter(
      (l) => contains(l.title, q.q!) || contains(l.seller.name, q.q!) || contains(l.area, q.q!),
    );
  rows = [...rows].sort((a, b) => asTime(b.createdAt) - asTime(a.createdAt));
  return paginate(rows, q.cursor, q.limit);
}

export function getListing(id: string): Listing {
  const l = db.listings.find((x) => x.id === id);
  if (!l) throw new ApiError('LISTING_NOT_FOUND', 'الإعلان مش موجود');
  return l;
}

/**
 * نفس `getListing` بس **بفحص ملكية إجباري** — لازم تتنادى من أي مسار
 * بوابة معارض (`dealers/hooks.ts`)، مش `getListing` الخام. `getListing`
 * نفسها تفضل بلا فحص لأن الأدمن شرعي يشوف أي إعلان بحكم الدور
 * (`admin/hooks.ts`) — الفرق مقصود، مش نسيان.
 *
 * ده إصلاح `FND-052` (IDOR, P0): معرض كان يقدر يفتح `/inventory/{id}`
 * بتاع معرض تاني ويشوف بياناته كاملة بمجرد تغيير الـid في الـURL.
 * **نفس الفحص ده لازم يتعمل سيرفر-سايد في الباك الحقيقي** —
 * `docs/BACKEND-CONTRACT.md §6.0` بيوثّقه كمتطلب إلزامي؛ النسخة هنا
 * مرجع تنفيذي للباك + إصلاح فعلي لوضع الموك نفسه.
 */
export function getOwnedListing(id: string, exhibitionId: string): Listing {
  const l = getListing(id);
  const ex = getExhibition(exhibitionId);
  if (l.seller.id !== ex.userId) {
    throw new ApiError('FORBIDDEN', 'الإعلان ده مش بتاع معرضك');
  }
  return l;
}

/**
 * إنشاء إعلان جديد فعليًا في `db.listings` — مسار الإضافة الفردية
 * (`/inventory/new`) والرفع بالجملة (`/inventory/bulk`) بيمرّوا هنا.
 * بيتنشر `draft` دايمًا (D-2 — أول صورة هي اللي بتفعّله)، وبيتنسب
 * لصاحب المعرض التجريبي الحالي عشان يظهر فورًا في `/inventory`
 * و`getMyListings()`.
 */
export function createListing(payload: {
  make: string;
  model: string;
  year: number;
  price: number;
  km: number;
  transmission: Transmission;
  body: string;
  color: string;
  governorate: string;
  area: string;
  description: string;
}): Listing {
  const seller = getUser(getDemoExhibition().userId);
  const listing: Listing = {
    id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: `${payload.make} ${payload.model}`,
    make: payload.make,
    model: payload.model,
    year: payload.year,
    price: payload.price,
    marketAvg: null,
    priceTag: null,
    km: payload.km,
    kmVerified: false,
    inspected: false,
    transmission: payload.transmission,
    body: payload.body,
    color: payload.color,
    governorate: payload.governorate,
    area: payload.area,
    status: 'draft',
    viewsCount: 0,
    photosCount: 0,
    imageUrl: null,
    seller: { id: seller.id, name: seller.name, phone: seller.phone, role: seller.role },
    description: payload.description,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
  };
  db.listings.push(listing);
  return listing;
}

/**
 * شارات الثقة (T-1, T-2) — **المسار الوحيد** لمنحها.
 * ممنوعة من أي endpoint بيستخدمه البائع (X-10).
 */
export function setListingFlags(
  id: string,
  flags: { kmVerified?: boolean; inspected?: boolean },
  reason: string,
): Listing {
  const l = getListing(id);
  const before = { kmVerified: l.kmVerified, inspected: l.inspected };
  if (flags.kmVerified !== undefined) l.kmVerified = flags.kmVerified;
  if (flags.inspected !== undefined) l.inspected = flags.inspected;
  audit('listing.flags_changed', 'listing', id, { before, after: flags, reason });
  return l;
}

export function setListingStatus(id: string, status: ListingStatus, reason: string): Listing {
  const l = getListing(id);
  const before = l.status;
  l.status = status;
  if (status === 'rejected') l.rejectionReason = reason;
  audit('listing.status_changed', 'listing', id, { before, after: status, reason });
  return l;
}

/* ═══════════════════════ بيع حالًا ═══════════════════════ */

export function querySellNow(q: { status?: string; cursor?: string | null; limit?: number } = {}): Page<SellNowRequest> {
  let rows = db.sellNow;
  if (q.status && q.status !== 'all') {
    if (q.status === 'closed') rows = rows.filter((r) => ['declined', 'expired', 'cancelled'].includes(r.status));
    else rows = rows.filter((r) => r.status === q.status);
  }
  rows = [...rows].sort((a, b) => asTime(a.createdAt) - asTime(b.createdAt));
  return paginate(rows, q.cursor, q.limit ?? 25);
}

export function getSellNow(id: string): SellNowRequest {
  const r = db.sellNow.find((x) => x.id === id);
  if (!r) throw new ApiError('NOT_FOUND', 'الطلب مش موجود');
  return r;
}

export function countSellNowPending(): number {
  return db.sellNow.filter((r) => r.status === 'pending').length;
}

/** حدود التحقق نفس OfferIn في الباك */
export function offerSellNow(id: string, price: number, note?: string): SellNowRequest {
  const r = getSellNow(id);
  if (r.status !== 'pending')
    throw new ApiError('CONFLICT', 'الطلب ده مش في حالة انتظار قرار');
  if (price < 10_000 || price > 100_000_000)
    throw new ApiError('VALIDATION_ERROR', 'السعر لازم يكون بين 10,000 و 100,000,000');
  r.status = 'offered';
  r.offerPrice = price;
  r.offeredAt = new Date().toISOString();
  // صلاحية العرض ٢٤ ساعة (SN-3)
  r.expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  audit('sell_now.offered', 'sell_now_request', id, {
    price,
    suggested: r.suggestedPrice,
    diff: price - r.suggestedPrice,
    note,
  });
  return r;
}

/**
 * الاستلام هو اللي بيخلّي العربية `sold` (SN-7).
 * `accepted` قبله معناها **محجوزة** بس.
 */
export function collectSellNow(id: string): SellNowRequest {
  const r = getSellNow(id);
  if (r.status !== 'accepted')
    throw new ApiError('CONFLICT', 'لازم البائع يقبل العرض الأول');
  r.status = 'collected';
  r.collectedAt = new Date().toISOString();
  const listing = db.listings.find((l) => l.id === r.listing.id);
  if (listing) listing.status = 'sold';
  audit('sell_now.collected', 'sell_now_request', id, { listingId: r.listing.id });
  return r;
}

/* ═══════════════════════ المعارض ═══════════════════════ */

export function queryExhibitions(
  q: { contracted?: boolean; verified?: boolean; q?: string; cursor?: string | null } = {},
): Page<Exhibition> {
  let rows = db.exhibitions;
  if (q.contracted !== undefined) rows = rows.filter((e) => e.isContracted === q.contracted);
  if (q.verified !== undefined) rows = rows.filter((e) => e.verified === q.verified);
  if (q.q) rows = rows.filter((e) => contains(e.name, q.q!) || contains(e.ownerName, q.q!));
  return paginate(rows, q.cursor, 25);
}

export function getExhibition(id: string): Exhibition {
  const e = db.exhibitions.find((x) => x.id === id);
  if (!e) throw new ApiError('NOT_FOUND', 'المعرض مش موجود');
  return e;
}

/**
 * المفتاح اللي بيحيي المزاد — الشرط ٢ من ٣ (A-1).
 * الدور والعقد **حاجتين منفصلتين عن قصد**: معرض عقده خلص بيفضل
 * معرض، بس مابيزايدش. متدمجهمش.
 */
export function setContract(id: string, isContracted: boolean, reason: string): Exhibition {
  const e = getExhibition(id);
  const before = e.isContracted;
  e.isContracted = isContracted;
  const now = new Date();
  if (isContracted) {
    e.contractStartsAt = now.toISOString();
    e.contractEndsAt = new Date(now.getTime() + 365 * DAY).toISOString();
  }
  audit('exhibition.contract_changed', 'exhibition', id, { before, after: isContracted, reason });
  return e;
}

/* ═══════════════════════ طلبات الترقية ═══════════════════════ */

export function queryApplications(
  q: { status?: string; cursor?: string | null } = {},
): Page<ExhibitionApplication> {
  let rows = db.applications;
  if (q.status && q.status !== 'all') rows = rows.filter((a) => a.status === q.status);
  rows = [...rows].sort((a, b) => asTime(b.createdAt) - asTime(a.createdAt));
  return paginate(rows, q.cursor, 25);
}

export function getApplication(id: string): ExhibitionApplication {
  const a = db.applications.find((x) => x.id === id);
  if (!a) throw new ApiError('NOT_FOUND', 'الطلب مش موجود');
  return a;
}

/**
 * الموافقة = **معاملة واحدة** بتعمل ٣ حاجات مع بعض:
 * تنشئ صف المعرض، وترقّي الدور، وتعلّم verified.
 * التعاقد **مش** جزء منها — ده قرار تاني (BUSINESS_RULES §1).
 */
export function approveApplication(id: string, reason: string): Exhibition {
  const app = getApplication(id);
  if (app.status === 'approved') throw new ApiError('CONFLICT', 'الطلب متوافق عليه بالفعل');
  app.status = 'approved';
  app.reviewedBy = ADMIN_USER.id;
  app.reviewedAt = new Date().toISOString();

  const user = db.users.find((u) => u.id === app.userId);
  if (user) user.role = 'exhibition';

  const ex: Exhibition = {
    id: `ex-${db.exhibitions.length + 1}`,
    userId: app.userId,
    name: app.name,
    ownerName: app.ownerName,
    phone: app.phone,
    area: app.area,
    governorate: app.governorate,
    address: app.address,
    verified: true,
    // مش متعاقد — ده قرار منفصل
    isContracted: false,
    contractStartsAt: null,
    contractEndsAt: null,
    commercialRegister: app.commercialRegister,
    taxId: app.taxId,
    logoUrl: null,
    coverUrl: null,
    financingNote: app.financingNote,
    inspectionService: app.inspectionService,
    listingsCount: 0,
    bidsCount: 0,
    winsCount: 0,
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.exhibitions.unshift(ex);

  audit('exhibition.application_approved', 'exhibition_application', id, { exhibitionId: ex.id, reason });
  audit('user.role_changed', 'user', app.userId, { before: 'individual', after: 'exhibition', reason });
  return ex;
}

export function rejectApplication(id: string, reason: string): ExhibitionApplication {
  const app = getApplication(id);
  app.status = 'rejected';
  app.reviewNote = reason;
  app.reviewedBy = ADMIN_USER.id;
  app.reviewedAt = new Date().toISOString();
  audit('exhibition.application_rejected', 'exhibition_application', id, { reason });
  return app;
}

export function requestInfoApplication(
  id: string,
  reason: string,
  fields: string[],
): ExhibitionApplication {
  const app = getApplication(id);
  app.status = 'needs_info';
  app.reviewNote = reason;
  app.requestedFields = fields;
  app.reviewedBy = ADMIN_USER.id;
  app.reviewedAt = new Date().toISOString();
  audit('exhibition.application_rejected', 'exhibition_application', id, { reason, fields, kind: 'needs_info' });
  return app;
}

/* ═══════════════════════ المزادات ═══════════════════════ */

export function queryAuctions(q: { status?: string; cursor?: string | null } = {}): Page<Auction> {
  let rows = db.auctions;
  if (q.status && q.status !== 'all') {
    if (q.status === 'overdue')
      rows = rows.filter((a) => a.status === 'live' && +new Date(a.endsAt) < Date.now());
    else rows = rows.filter((a) => a.status === q.status);
  }
  rows = [...rows].sort((a, b) => asTime(a.endsAt) - asTime(b.endsAt));
  return paginate(rows, q.cursor, 25);
}

export function getAuction(id: string): Auction {
  const a = db.auctions.find((x) => x.id === id);
  if (!a) throw new ApiError('NOT_FOUND', 'المزاد مش موجود');
  return a;
}

export function getAuctionBids(id: string): AuctionBid[] {
  return db.bids
    .filter((b) => b.auctionId === id)
    .sort((a, b) => asTime(b.createdAt) - asTime(a.createdAt));
}

export function getAuctionEntries(id?: string): AuctionEntry[] {
  return id ? db.entries.filter((e) => e.auctionId === id) : db.entries;
}

/** المزادات المتأخرة عن القفل — عَرَض مباشر لوقوف الـworker */
export function countOverdueAuctions(): number {
  return db.auctions.filter((a) => a.status === 'live' && +new Date(a.endsAt) < Date.now()).length;
}

export function markEntryPaid(entryId: string, reason: string): AuctionEntry {
  const e = db.entries.find((x) => x.id === entryId);
  if (!e) throw new ApiError('NOT_FOUND', 'تسجيل الدخول مش موجود');
  e.paidAt = new Date().toISOString();
  audit('auction_entry.paid', 'auction_entry', entryId, { auctionId: e.auctionId, reason });
  return e;
}

/** بيشتغل بس على مزاد `settled` — غير كده AUCTION_NOT_SETTLED (A-11) */
export function markAuctionDefaulted(id: string, reason: string): Auction {
  const a = getAuction(id);
  if (a.status !== 'settled')
    throw new ApiError('AUCTION_NOT_SETTLED', 'المزاد لازم يكون متسوّى قبل ما يتعلّم متعثر');
  a.status = 'defaulted';
  audit('auction.defaulted', 'auction', id, { reason });
  return a;
}

/**
 * وضع مزايدة — بيقلّد حارس `_authorize_bidder` في الباك:
 * ٣ شروط مستقلة وكل واحد بيفشل برسالته (A-1).
 */
export function placeBid(
  auctionId: string,
  amount: number,
  bidder: { exhibitionId: string; exhibitionName: string; userId: string },
): { auction: Auction; bid: AuctionBid } {
  const a = getAuction(auctionId);
  const ex = db.exhibitions.find((e) => e.id === bidder.exhibitionId);

  if (!ex) throw new ApiError('NOT_AN_EXHIBITION', 'الحساب ده مش معرض');
  if (!ex.isContracted) throw new ApiError('NOT_CONTRACTED', 'معرضك مش متعاقد مع CarQ');

  const entry = db.entries.find((e) => e.auctionId === auctionId && e.exhibitionId === ex.id);
  if (!entry || !entry.paidAt)
    throw new ApiError('ENTRY_NOT_PAID', 'لازم تدفع رسوم دخول المزاد الأول');

  if (a.sellerId === bidder.userId)
    throw new ApiError('CANNOT_BID_OWN_LISTING', 'مينفعش تزايد على عربيتك');
  if (a.status !== 'live') throw new ApiError('AUCTION_NOT_LIVE', 'المزاد مش شغال');
  if (+new Date(a.endsAt) <= Date.now()) throw new ApiError('AUCTION_ENDED', 'المزاد انتهى');
  if (amount < a.nextBid)
    throw new ApiError('BID_TOO_LOW', 'حد زايد قبلك — المزايدة الجاية بقت أعلى');
  if ((amount - a.startPrice) % a.bidStep !== 0)
    throw new ApiError('BID_NOT_ON_STEP', 'المبلغ مش على خطوة المزايدة');

  const bid: AuctionBid = {
    id: `b-live-${Date.now()}`,
    auctionId,
    bidderId: ex.id,
    exhibitionName: ex.name,
    amount,
    createdAt: new Date().toISOString(),
  };
  db.bids.push(bid);
  a.currentBid = amount;
  a.nextBid = amount + a.bidStep;
  a.bidsCount += 1;
  a.topBid = { exhibitionName: ex.name, amount };

  // تمديد ضد القنص: آخر ٦٠ ثانية بتمدّ ٦٠ ثانية، بحد أقصى ٢٠ مرة (A-5)
  const remaining = +new Date(a.endsAt) - Date.now();
  if (remaining < 60_000 && a.extensionCount < 20) {
    a.endsAt = new Date(Date.now() + 60_000).toISOString();
    a.extensionCount += 1;
    // الحدث بيوصل الأول عشان الشاشة تعرض «المزاد اتمدّ» على `endsAt` الجديد
    // من غير ما تستنى `bid.placed` تفرّق بينهم (نفس الترتيب اللي WS حقيقي هيبعته)
    emitMockRealtimeEvent('auction:' + auctionId, 'auction.extended', {
      auctionId,
      endsAt: a.endsAt,
    });
  }

  // `bidCount` من غير `s` — نفس تسمية §4.5 بالحرف، مش `Auction.bidsCount`
  emitMockRealtimeEvent('auction:' + auctionId, 'bid.placed', {
    auctionId,
    bidId: bid.id,
    exhibitionName: ex.name,
    amount,
    bidCount: a.bidsCount,
    endsAt: a.endsAt,
    createdAt: bid.createdAt,
  });

  return { auction: a, bid };
}

/**
 * `a-1` (المرحلة ٠ من `seed.ts`، `overdue = isLive && i === 0`) متعمّد
 * إنه يفضل `live` بـ`endsAt` في الماضي **للأبد** — دي العينة اللي
 * بتوري بانر «العامل الخلفي واقف» في `/health` وفي كل شاشة أدمن
 * (`FND` قديمة من المرحلة ٠). لو الووركر تحت قفلها زي أي مزاد عادي،
 * الفيكستشر ده بيتكسر بعد أول ٥ ثواني من تشغيل التطبيق — واللي
 * بيختبر «الووركر واقف» هيلاقي مفيش مزاد متأخر أصلًا (اتلقط فعليًا:
 * `admin.spec.ts` بدأ يفشل بعد ساعات من تشغيل نفس السيرفر — كل
 * المزادات الـlive المتبقّية اتقفلت). الاستثناء ده مقصود ومستندله.
 */
const PERPETUALLY_OVERDUE_DEMO_AUCTION_ID = 'a-1';

/**
 * ووركر موك بسيط (`A-8`): بيقفل أي مزاد `live` عدّى ميعاده كل ٥ ثواني
 * ويبعت `auction.ended`. **الشاشة نفسها ممنوع تقفل المزاد** — دي مسؤولية
 * الووركر بس (حقيقي أو موك)، وده بالظبط اللي الحلقة دي بتقلّده.
 */
if (typeof window !== 'undefined') {
  setInterval(() => {
    const dueNow = Date.now();
    for (const a of db.auctions) {
      if (a.id === PERPETUALLY_OVERDUE_DEMO_AUCTION_ID) continue;
      if (a.status !== 'live' || +new Date(a.endsAt) > dueNow) continue;
      const winner = getAuctionBids(a.id)[0]; // الأحدث = الأعلى (bidStep ثابت وتصاعدي)
      a.status = a.bidsCount > 0 ? 'settled' : 'failed';
      a.winnerBidId = winner?.id ?? null;
      emitMockRealtimeEvent('auction:' + a.id, 'auction.ended', {
        auctionId: a.id,
        status: a.status,
      });
    }
  }, 5_000);
}

/** تسجيل الالتزام — **مش تحصيل فلوس**. الأدمن بيأكد التحويل. */
export function createEntry(auctionId: string, exhibitionId: string): AuctionEntry {
  const existing = db.entries.find((e) => e.auctionId === auctionId && e.exhibitionId === exhibitionId);
  if (existing) return existing;
  const ex = getExhibition(exhibitionId);
  const a = getAuction(auctionId);
  const entry: AuctionEntry = {
    id: `en-live-${Date.now()}`,
    auctionId,
    auctionListingTitle: a.listing.title,
    exhibitionId,
    exhibitionName: ex.name,
    fee: 0,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  db.entries.push(entry);
  return entry;
}

/* ═══════════════════════ المستخدمين ═══════════════════════ */

export function queryUsers(
  q: { role?: UserRole | 'all'; status?: UserStatus | 'all'; q?: string; cursor?: string | null } = {},
): Page<User> {
  let rows = db.users;
  if (q.role && q.role !== 'all') rows = rows.filter((u) => u.role === q.role);
  if (q.status && q.status !== 'all') rows = rows.filter((u) => u.status === q.status);
  if (q.q) rows = rows.filter((u) => contains(u.name, q.q!) || u.phone.includes(q.q!));
  rows = [...rows].sort((a, b) => asTime(b.createdAt) - asTime(a.createdAt));
  return paginate(rows, q.cursor, 25);
}

export function getUser(id: string): User {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new ApiError('NOT_FOUND', 'المستخدم مش موجود');
  return u;
}

/** أخطر أكشن في شاشة المستخدمين — الشرط ١ من ٣ للمزايدة (§4.7) */
export function setUserRole(id: string, role: UserRole, reason: string): User {
  const u = getUser(id);
  const before = u.role;
  u.role = role;
  audit('user.role_changed', 'user', id, { before, after: role, reason });
  return u;
}

export function setUserStatus(id: string, status: UserStatus, reason: string): User {
  const u = getUser(id);
  const before = u.status;
  u.status = status;
  u.suspendedReason = status === 'suspended' ? reason : null;
  u.suspendedAt = status === 'suspended' ? new Date().toISOString() : null;
  audit('user.status_changed', 'user', id, { before, after: status, reason });
  return u;
}

/** كشف رقم التليفون بيتسجّل — بيانات شخصية (§10.2) */
export function revealPhone(userId: string): string {
  const u = getUser(userId);
  audit('user.phone_revealed', 'user', userId, { at: new Date().toISOString() });
  return u.phone;
}

/* ═══════════════════════ التمويل ═══════════════════════ */

export function queryFinancing(
  q: { status?: string; cursor?: string | null } = {},
): Page<FinancingApplication> {
  let rows = db.financing;
  if (q.status && q.status !== 'all') rows = rows.filter((f) => f.status === q.status);
  rows = [...rows].sort((a, b) => asTime(a.createdAt) - asTime(b.createdAt));
  return paginate(rows, q.cursor, 25);
}

export function getFinancing(id: string): FinancingApplication {
  const f = db.financing.find((x) => x.id === id);
  if (!f) throw new ApiError('NOT_FOUND', 'الطلب مش موجود');
  return f;
}

export function setFinancingStatus(
  id: string,
  status: FinancingStatus,
  reason: string,
): FinancingApplication {
  const f = getFinancing(id);
  const before = f.status;
  f.status = status;
  f.reviewedBy = ADMIN_USER.id;
  f.reviewedAt = new Date().toISOString();
  // الرفض بيقفل الطلب نهائيًا — الواجهة بتوعد المستخدم صراحة إن صور
  // البطاقة بتتمسح من التخزين بعد القفل (F-6)، فده لازم يتحقق فعليًا
  // مش يفضل معتمد على الصدفة في بيانات الـseed
  if (status === 'rejected') f.idImagesDeletedAt = new Date().toISOString();
  audit('financing.status_changed', 'financing_application', id, { before, after: status, reason });
  return f;
}

/**
 * صور البطاقة (F-6 · §10.1): المفتاح **مش رابط**. الرابط بيتولّد
 * موقّع لخمس دقايق بس، وكل فتحة بتتسجّل. الفرونت ممنوع يبني الرابط
 * بنفسه أو يكاش الصورة.
 */
export function signIdImage(appId: string, side: 'front' | 'back'): SignedImageUrl {
  const f = getFinancing(appId);
  if (f.idImagesDeletedAt)
    throw new ApiError('NOT_FOUND', 'الصور اتمسحت بعد قفل الطلب');
  audit('financing.id_image_viewed', 'financing_application', appId, {
    side,
    key: side === 'front' ? f.idFrontKey : f.idBackKey,
  });
  // في الحقيقي ده رابط موقّع (presigned S3 أو مشابه) بييجي من الباك
  // مباشرة. مفيش تخزين حقيقي في الموك، فبنرجّع أصل ثابت محلي (placeholder
  // — لقطنا في المرحلة ٧ إن مفيش أي رد فعلي كان بيتسجّل، والصورة كانت
  // بترجع 404 دايمًا في وضع الديمو) بدل ما نبني route جديد فيه ألوان
  // hex ثابتة (ممنوعة في طبقة الصفحات — static-checks.mjs::no-hex-in-pages).
  return {
    url: '/id-card-placeholder.svg',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

/* ═══════════════════════ السكان والصحة ═══════════════════════ */

export function queryScanJobs(q: { status?: string; cursor?: string | null } = {}): Page<ScanJob> {
  let rows = db.scanJobs;
  if (q.status && q.status !== 'all') rows = rows.filter((s) => s.status === q.status);
  rows = [...rows].sort((a, b) => asTime(b.createdAt) - asTime(a.createdAt));
  return paginate(rows, q.cursor, 25);
}

export function getHealth(): HealthSnapshot {
  /**
   * FND-036 — عتبات SLA هنا (طابور الفحص، فشل آخر ٢٤ ساعة، عروض/إعلانات
   * منتهية) بتتقاس نسبةً للبيانات المولّدة (`seed.ts`)، فلازم تتحسب على
   * ساعة الموك المجمّدة (`MOCK_NOW`) مش الوقت الحقيقي — وإلا كل عتبة
   * بتتغيّر بصمت كل ما سيرفر التطوير يفضل شغّال ساعات/أيام أكتر (نفس جذر
   * FND-056). `countOverdueAuctions`/`checkedAt` استثناء متعمّد — دول
   * جزء من نظام المزادات اللايف اللي فعلًا محتاج وقت حقيقي متقدّم.
   */
  const now = MOCK_NOW;
  const queued = db.scanJobs.filter((s) => s.status === 'queued');
  const oldest = queued.reduce((min, s) => Math.min(min, +new Date(s.createdAt)), now);
  const oldestSeconds = queued.length ? Math.round((now - oldest) / 1000) : 0;
  const active = db.listings.filter((l) => l.status === 'active');
  const unpriced = active.filter((l) => l.marketAvg === null).length;

  return {
    // > ٥ دقايق في الطابور = الـworker واقف
    workerAlive: oldestSeconds < 300,
    queuedScans: queued.length,
    oldestQueuedScanSeconds: oldestSeconds,
    failedScans24h: db.scanJobs.filter(
      (s) => s.status === 'failed' && now - +new Date(s.createdAt) < DAY,
    ).length,
    overdueAuctions: countOverdueAuctions(),
    expiredSellNowOffers: db.sellNow.filter(
      (r) => r.status === 'offered' && r.expiresAt !== null && +new Date(r.expiresAt) < now,
    ).length,
    expiredActiveListings: db.listings.filter(
      (l) => l.status === 'active' && l.expiresAt !== null && +new Date(l.expiresAt) < now,
    ).length,
    unpricedActivePct: active.length ? (unpriced / active.length) * 100 : 0,
    idempotencyKeys: 1840,
    checkedAt: new Date().toISOString(),
  };
}

/* ═══════════════════════ التدقيق ═══════════════════════ */

/**
 * FND-037 — فلترة الفاعل والتاريخ (`ADMIN §6.3` بند ٣: `?from=&to=&actor_id=`)
 * كانت بحث نصي في الصفحة المعروضة بس (٣٠ صف)، مش على السجل كله. دلوقتي
 * الفلترتين بتتطبّقوا هنا على `db.auditLog` كله **قبل** الترقيم — زي أي
 * فلتر تاني في المشروع. `actor` بيدوّر بالاسم (مش لازم تعرف الـid)، وده
 * أنسب لواجهة أدمن بيكتب اسم زميله؛ الباك الحقيقي حر يطابق بالـid أو
 * الاسم طول ما البحث بيغطي السجل كله مش صفحة واحدة بس.
 */
export function queryAudit(
  q: {
    entityType?: string;
    entityId?: string;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    cursor?: string | null;
  } = {},
): Page<AuditEntry> {
  let rows = db.auditLog;
  if (q.entityType && q.entityType !== 'all') rows = rows.filter((a) => a.entityType === q.entityType);
  if (q.entityId) rows = rows.filter((a) => a.entityId === q.entityId);
  if (q.action && q.action !== 'all') rows = rows.filter((a) => a.action === q.action);
  if (q.actor?.trim()) {
    const needle = q.actor.trim().toLowerCase();
    rows = rows.filter((a) => a.actorName.toLowerCase().includes(needle));
  }
  if (q.from) {
    // بداية اليوم بتوقيت القاهرة — بتحسب إزاحة الصيفي/الشتوي الصحيحة
    // لتاريخ بعينه (X-2)، مش إزاحة ثابتة
    const fromMs = cairoWallTimeToMs(`${q.from}T00:00:00`);
    rows = rows.filter((a) => +new Date(a.createdAt) >= fromMs);
  }
  if (q.to) {
    // آخر لحظة في يوم "إلى" نفسه بتوقيت القاهرة، مش أوله
    const toMs = cairoWallTimeToMs(`${q.to}T23:59:59.999`);
    rows = rows.filter((a) => +new Date(a.createdAt) <= toMs);
  }
  return paginate(rows, q.cursor, 30);
}

/* ═══════════════════════ الإحصائيات ═══════════════════════ */

function countByStatus<T extends { status: string }>(rows: T[], keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  keys.forEach((k) => (out[k] = 0));
  rows.forEach((r) => {
    if (out[r.status] !== undefined) out[r.status] += 1;
  });
  return out;
}

/**
 * فلاتر §4.1 — بتفلتر الأرقام المشتقة من الإعلانات.
 * الباك الحقيقي بيطبّق نفس المنطق على مستوى SQL.
 */
const listingMatches = (l: Listing, f: StatsFilters = {}): boolean =>
  (!f.governorate || l.governorate === f.governorate) && (!f.make || l.make === f.make);

/** مجموعة ids الإعلانات المطابقة — للكيانات اللي بتشاور على إعلان */
function matchingListingIds(f: StatsFilters = {}): Set<string> | null {
  if (!f.governorate && !f.make) return null; // مفيش فلتر ⇒ مفيش تقييد
  return new Set(db.listings.filter((l) => listingMatches(l, f)).map((l) => l.id));
}

export function getOverview(f: StatsFilters = {}): OverviewStats {
  const listings = db.listings.filter((l) => listingMatches(l, f));
  const ids = matchingListingIds(f);
  const inScope = <T,>(rows: T[], idOf: (r: T) => string): T[] =>
    ids ? rows.filter((r) => ids.has(idOf(r))) : rows;
  const sellNowRows = inScope(db.sellNow, (r) => r.listing.id);
  const auctionRows = inScope(db.auctions, (a) => a.listing.id);
  const financingRows = inScope(db.financing, (r) => r.listing.id);
  const active = listings.filter((l) => l.status === 'active');
  const withPhotos = listings.filter((l) => l.photosCount > 0).length;
  const weekAgo = Date.now() - 7 * DAY;

  const build = (scale: number): Omit<OverviewStats, 'previous'> => ({
    listings: countByStatus(listings, [
      'draft',
      'active',
      'reserved',
      'sold',
      'expired',
      'removed',
      'rejected',
    ]) as OverviewStats['listings'],
    users: {
      total: db.users.length,
      new: Math.round(db.users.filter((u) => +new Date(u.createdAt) > weekAgo).length * scale),
      individual: db.users.filter((u) => u.role === 'individual').length,
      exhibition: db.users.filter((u) => u.role === 'exhibition').length,
      admin: db.users.filter((u) => u.role === 'admin').length,
    },
    sellNow: {
      pending: sellNowRows.filter((r) => r.status === 'pending').length,
      offered: sellNowRows.filter((r) => r.status === 'offered').length,
      accepted: sellNowRows.filter((r) => r.status === 'accepted').length,
      collected: sellNowRows.filter((r) => r.status === 'collected').length,
    },
    auctions: {
      live: auctionRows.filter((a) => a.status === 'live').length,
      settled: auctionRows.filter((a) => a.status === 'settled').length,
      failed: auctionRows.filter((a) => a.status === 'failed').length,
      overdue: countOverdueAuctions(),
    },
    financing: countByStatus(financingRows, [
      'submitted',
      'contacted',
      'approved',
      'rejected',
    ]) as OverviewStats['financing'],
    trust: {
      kmVerifiedPct: listings.length
        ? (listings.filter((l) => l.kmVerified).length / listings.length) * 100
        : 0,
      inspectedPct: listings.length
        ? (listings.filter((l) => l.inspected).length / listings.length) * 100
        : 0,
      withPhotosPct: listings.length ? (withPhotos / listings.length) * 100 : 0,
      pricedPct: active.length
        ? (active.filter((l) => l.marketAvg !== null).length / active.length) * 100
        : 0,
    },
  });

  const current = build(1);
  // الفترة السابقة تقديرية في الموك — الباك بيحسبها فعليًا
  const prev = build(0.82);
  prev.listings = { ...current.listings, active: Math.round(current.listings.active * 0.88) };
  prev.sellNow = {
    pending: Math.max(0, current.sellNow.pending - 2),
    offered: Math.round(current.sellNow.offered * 0.8),
    accepted: Math.round(current.sellNow.accepted * 0.75),
    collected: Math.round(current.sellNow.collected * 0.7),
  };
  return { ...current, previous: prev };
}

/**
 * سلسلة زمنية بمفاتيح أيام **متصلة** — الأيام الفاضية بصفر مش محذوفة،
 * وإلا الخط بيكدب على الفترات الميتة (§6.2).
 *
 * `f` = فلاتر §4.1: مدى مخصص (from/to بياخد أولوية على days) +
 * محافظة/ماركة للمقاييس المشتقة من الإعلانات.
 */
export function getTimeseries(
  metric: TimeseriesMetric,
  days = 30,
  f: StatsFilters = {},
): TimeseriesPoint[] {
  // المدى المخصص بيتحوّل لنطاق أيام صحيح — بحد أقصى سنة
  let end = Date.now();
  let span = days;
  if (f.from && f.to) {
    const fromMs = +new Date(f.from);
    const toMs = +new Date(f.to);
    if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && toMs >= fromMs) {
      end = toMs;
      span = Math.min(365, Math.max(1, Math.round((toMs - fromMs) / DAY) + 1));
    }
  }

  const buckets = new Map<string, Record<string, number>>();
  for (let i = span - 1; i >= 0; i--) {
    buckets.set(cairoKey(new Date(end - i * DAY).toISOString()), {});
  }

  const add = (dateStr: string | null, series: string) => {
    if (!dateStr) return;
    const k = cairoKey(dateStr);
    const b = buckets.get(k);
    if (b) b[series] = (b[series] ?? 0) + 1;
  };

  const ids = matchingListingIds(f);
  const inScope = (listingId: string) => !ids || ids.has(listingId);

  switch (metric) {
    case 'listings_published':
      db.listings.filter((l) => listingMatches(l, f)).forEach((l) => add(l.publishedAt, 'count'));
      break;
    case 'users_created':
      db.users.forEach((u) => add(u.createdAt, 'count'));
      break;
    case 'sell_now_requests':
      db.sellNow.filter((r) => inScope(r.listing.id)).forEach((r) => add(r.createdAt, r.status));
      break;
    case 'auction_bids':
      db.bids.forEach((b) => add(b.createdAt, 'count'));
      break;
    case 'financing_applications':
      db.financing.filter((r) => inScope(r.listing.id)).forEach((r) => add(r.createdAt, r.status));
      break;
    case 'financing_by_type':
      // C-33: سلسلتين واضحتين — «مرابحة» و«عادي»
      db.financing
        .filter((r) => inScope(r.listing.id))
        .forEach((r) => add(r.createdAt, r.islamic ? 'islamic' : 'normal'));
      break;
    case 'auctions_created':
      // C-20: سلسلة لكل حالة — الصفحة بتجمّعها أسابيع
      db.auctions.filter((a) => inScope(a.listing.id)).forEach((a) => add(a.createdAt, a.status));
      break;
    case 'scan_jobs':
      db.scanJobs.forEach((s) => add(s.createdAt, s.status));
      break;
    case 'chat_messages':
      db.chats.forEach((c) => add(c.lastMessageAt, 'count'));
      break;
  }

  return Array.from(buckets.entries()).map(([t, series]) => ({ t, series }));
}

export function getBreakdown(dimension: BreakdownDimension, f: StatsFilters = {}): BreakdownBucket[] {
  const map = new Map<string, { count: number; value: number }>();
  const bump = (key: string, value = 0) => {
    const cur = map.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += value;
    map.set(key, cur);
  };

  const listings = db.listings.filter((l) => listingMatches(l, f));
  const ids = matchingListingIds(f);
  const inScope = (listingId: string) => !ids || ids.has(listingId);

  switch (dimension) {
    case 'make':
      listings.forEach((l) => bump(l.make, l.price));
      break;
    case 'governorate':
      listings.forEach((l) => bump(l.governorate, l.price));
      break;
    case 'price_tag':
      // الـnull شريحة ظاهرة صراحة — «مش متسعّر» (P-4)
      listings.forEach((l) => bump(l.priceTag ?? 'unpriced'));
      break;
    case 'listing_status':
      listings.forEach((l) => bump(l.status));
      break;
    case 'body':
      listings.forEach((l) => bump(l.body));
      break;
    case 'transmission':
      listings.forEach((l) => bump(l.transmission));
      break;
    case 'price_bucket': {
      listings.forEach((l) => {
        const b = Math.floor(l.price / 200_000) * 200_000;
        bump(String(b));
      });
      break;
    }
    case 'term_months':
      db.financing.filter((r) => inScope(r.listing.id)).forEach((r) => bump(String(r.termMonths)));
      break;
    case 'down_tier':
      db.financing.filter((r) => inScope(r.listing.id)).forEach((r) => bump(String(r.downTier)));
      break;
    case 'auction_status':
      // C-24: منه بيتحسب معدل النجاح settled / (settled + failed)
      db.auctions.filter((a) => inScope(a.listing.id)).forEach((a) => bump(a.status));
      break;
    case 'bids_by_exhibition':
      // C-23: أنشط المعارض — المفتاح اسم المعرض زي ما بيتعرض
      db.bids.forEach((b) => bump(b.exhibitionName));
      break;
    case 'financing_monthly': {
      // C-34: القسط من الـsnapshot زي ما هو (**مش محسوب من جديد**) — شرايح ٢٬٠٠٠
      db.financing
        .filter((r) => inScope(r.listing.id))
        .forEach((r) => bump(String(Math.floor(r.quoteSnapshot.monthly / 2_000) * 2_000)));
      break;
    }
    case 'sellnow_value':
      // C-14: القيمة مجموع offer_price — الـpending مالوش عرض لسه فقيمته صفر
      db.sellNow
        .filter((r) => inScope(r.listing.id))
        .forEach((r) => bump(r.status, r.offerPrice ?? 0));
      break;
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, count: v.count, value: v.value }))
    .sort((a, b) => b.count - a.count);
}

export function getFunnel(name: 'publish' | 'sell_now' | 'financing', f: StatsFilters = {}) {
  const ids = matchingListingIds(f);
  const inScope = (listingId: string) => !ids || ids.has(listingId);

  if (name === 'publish') {
    const l = db.listings.filter((x) => listingMatches(x, f));
    return {
      steps: [
        { key: 'draft', label: 'اتعمل (مسودة)', count: l.length },
        { key: 'active', label: 'اتنشر', count: l.filter((x) => x.status !== 'draft').length },
        { key: 'chat', label: 'وصله استفسار', count: Math.round(l.length * 0.42) },
        {
          key: 'reserved',
          label: 'اتحجز',
          count: l.filter((x) => ['reserved', 'sold'].includes(x.status)).length,
        },
        { key: 'sold', label: 'اتباع', count: l.filter((x) => x.status === 'sold').length },
      ],
    };
  }
  if (name === 'sell_now') {
    const r = db.sellNow.filter((x) => inScope(x.listing.id));
    const reached = (s: string[]) => r.filter((x) => s.includes(x.status)).length;
    return {
      steps: [
        { key: 'requested', label: 'اتقدّم طلب', count: r.length },
        {
          key: 'offered',
          label: 'اتصدر عرض',
          count: reached(['offered', 'accepted', 'collected', 'declined', 'expired']),
        },
        { key: 'accepted', label: 'اتقبل', count: reached(['accepted', 'collected']) },
        { key: 'collected', label: 'اتستلم', count: reached(['collected']) },
      ],
    };
  }
  const fin = db.financing.filter((x) => inScope(x.listing.id));
  const reached = (s: string[]) => fin.filter((x) => s.includes(x.status)).length;
  return {
    steps: [
      { key: 'submitted', label: 'اتقدّم', count: fin.length },
      {
        key: 'contacted',
        label: 'اتواصلنا',
        count: reached(['contacted', 'approved', 'rejected']),
      },
      { key: 'approved', label: 'اتوافق عليه', count: reached(['approved']) },
    ],
  };
}

/**
 * C-52: نشاط الأدمن — يوم أسبوع × ساعة (بتوقيت القاهرة) من سجل التدقيق.
 * الباك الحقيقي: `GET /v1/admin/stats/admin-activity` — endpoint ناقص (§6.2).
 */
export function getAdminActivity(): AdminActivityCell[] {
  const grid = new Map<string, number>();
  for (const e of db.auditLog) {
    const d = new Date(e.createdAt);
    // تحويل للقاهرة عن طريق التنسيق — بيراعي التوقيت الصيفي
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(d);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    const k = `${day}:${hour}`;
    grid.set(k, (grid.get(k) ?? 0) + 1);
  }
  return Array.from(grid.entries()).map(([k, count]) => {
    const [day, hour] = k.split(':').map(Number);
    return { day: day!, hour: hour!, count };
  });
}

/* ═══════════════════════ بوابة المعارض ═══════════════════════ */

/** المعرض التجريبي اللي بوابة المعارض بتشتغل بحسابه في وضع الموك */
export const DEMO_EXHIBITION_ID = 'ex-1';

export function getDemoExhibition(): Exhibition {
  return getExhibition(DEMO_EXHIBITION_ID);
}

/**
 * هوية الدخول في وضع الديمو — كل تطبيق بيطلب دور واحد بس افتراضيًا
 * (المرحلة ٢): الأدمن دايمًا `ADMIN_USER`، والمعارض دايمًا صاحب
 * `DEMO_EXHIBITION_ID`. مفيش تحقق حقيقي على الرقم/الكود في وضع الموك
 * — القرار ده موثّق ومقصود (`DEMO_MODE` في `client.ts`)، مش نقص.
 *
 * **الاستثناء المتعمّد:** لو الرقم اللي اتكتب فعليًا رقم مستخدم حقيقي
 * موجود في قاعدة الموك (بغض النظر عن دوره)، بنرجّع هويته الحقيقية —
 * بالظبط زي ما باك اند حقيقي هيرجّع صاحب الرقم ده مهما كانت اللوحة
 * اللي بيحاول يدخلها. ده اللي بيسمح تختبر «دخول مرفوض» (دور غلط)
 * e2e فعليًا — مثلًا رقم `ADMIN_USER` (`01001234553`) في بوابة
 * المعارض، أو رقم صاحب المعرض التجريبي (`01246830664`) في لوحة
 * الأدمن — من غير ما يتغيّر سلوك الديمو الافتراضي لأي رقم تاني.
 */
export function getMockIdentity(role: UserRole, phone?: string): User {
  const digits = phone?.replace(/\D/g, '');
  if (digits) {
    const existing = db.users.find((u) => u.phone.replace(/\D/g, '') === digits);
    if (existing) return existing;
  }
  if (role === 'admin') return ADMIN_USER;
  return getUser(getDemoExhibition().userId);
}

export function getMyListings(exhibitionId = DEMO_EXHIBITION_ID): Listing[] {
  const ex = getExhibition(exhibitionId);
  return db.listings.filter((l) => l.seller.id === ex.userId);
}

export function getMyChats(): ChatThread[] {
  return [...db.chats].sort((a, b) => asTime(b.lastMessageAt) - asTime(a.lastMessageAt));
}

function threadOrThrow(threadId: string): ChatThread {
  const t = db.chats.find((c) => c.id === threadId);
  if (!t) throw new ApiError('NOT_FOUND', 'المحادثة دي مش موجودة', null, 404);
  return t;
}

/** رسايل محادثة بالترتيب الزمني — GET /v1/chats/{id}/messages */
export function getThreadMessages(threadId: string): ChatMessage[] {
  threadOrThrow(threadId);
  return db.chatMessages
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => asTime(a.at) - asTime(b.at));
}

/** فتح المحادثة بيصفّر غير المقروء — POST /v1/chats/{id}/read */
export function markThreadRead(threadId: string): ChatThread {
  const t = threadOrThrow(threadId);
  t.unread = 0;
  return t;
}

/** رد المعرض — POST /v1/chats/{id}/messages */
export function sendChatMessage(threadId: string, body: string): ChatMessage {
  const t = threadOrThrow(threadId);
  const text = body.trim();
  if (!text) throw new ApiError('VALIDATION_ERROR', 'اكتب رسالة الأول', null, 422);

  const msg: ChatMessage = {
    id: `${threadId}-m${Date.now()}`,
    threadId,
    from: 'exhibition',
    body: text,
    at: new Date().toISOString(),
  };
  db.chatMessages.push(msg);

  t.lastMessage = text;
  t.lastMessageAt = msg.at;
  t.messagesCount += 1;
  t.unread = 0; // بترد يبقى إنت شايف الرسايل

  // أول رد بيثبّت مؤشر زمن أول رد — من أول رسالة للمشتري
  if (t.firstResponseMinutes === null) {
    const first = db.chatMessages
      .filter((m) => m.threadId === threadId && m.from === 'buyer')
      .sort((a, b) => asTime(a.at) - asTime(b.at))[0];
    if (first) {
      t.firstResponseMinutes = Math.max(1, Math.round((asTime(msg.at) - asTime(first.at)) / 60_000));
    }
  }
  return msg;
}

export function getMyEntries(exhibitionId = DEMO_EXHIBITION_ID): AuctionEntry[] {
  return db.entries.filter((e) => e.exhibitionId === exhibitionId);
}

/** المزادات مع حالة دخول المعرض الحالي مضمّنة — يمنع نداء لكل صف (§8.3) */
export function getAuctionsForExhibition(
  exhibitionId = DEMO_EXHIBITION_ID,
  status: string = 'live',
): Auction[] {
  const rows =
    status === 'all' ? db.auctions : db.auctions.filter((a) => a.status === status);
  return rows.map((a) => {
    const entry = db.entries.find((e) => e.auctionId === a.id && e.exhibitionId === exhibitionId);
    return { ...a, myEntry: entry ? { id: entry.id, paid: entry.paidAt !== null } : null };
  });
}

export function getExhibitionStats(exhibitionId = DEMO_EXHIBITION_ID): ExhibitionStats {
  const mine = getMyListings(exhibitionId);
  const myEntries = getMyEntries(exhibitionId);
  const myBids = db.bids.filter((b) => b.bidderId === exhibitionId);
  const liveAuctions = db.auctions.filter((a) => a.status === 'live');
  const highestIn = liveAuctions.filter((a) => {
    const top = getAuctionBids(a.id)[0];
    return top?.bidderId === exhibitionId;
  }).length;

  const views30d = mine.reduce((s, l) => s + l.viewsCount, 0);
  const sold = mine.filter((l) => l.status === 'sold');

  const current: Omit<ExhibitionStats, 'previous'> = {
    listedCars: mine.filter((l) => l.status === 'active').length,
    views30d,
    newLeads: db.chats.filter((c) => c.unread > 0).length,
    availableAuctions: liveAuctions.length,
    highestBidderIn: highestIn,
    wins30d: db.auctions.filter(
      (a) => a.status === 'settled' && getAuctionBids(a.id)[0]?.bidderId === exhibitionId,
    ).length,
    dueFees: myEntries.filter((e) => e.paidAt === null).length,
    avgDaysToSell: sold.length ? 26 : null,
  };

  return {
    ...current,
    previous: {
      ...current,
      listedCars: Math.round(current.listedCars * 0.9),
      views30d: Math.round(views30d * 0.78),
      newLeads: Math.max(0, current.newLeads - 1),
      wins30d: Math.max(0, current.wins30d - 1),
      availableAuctions: current.availableAuctions,
      highestBidderIn: current.highestBidderIn,
      dueFees: current.dueFees,
      avgDaysToSell: current.avgDaysToSell,
    },
  };
}

export { MOCK_NOW, ADMIN_USER, seed };
export const myBidsOf = (exhibitionId = DEMO_EXHIBITION_ID) =>
  db.bids.filter((b) => b.bidderId === exhibitionId);

/* ═══════════════════════ الكتالوج ═══════════════════════ */

const byAr = (a: string, b: string) => a.localeCompare(b, 'ar');
const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort(byAr);

function groupUnique(
  rows: Listing[],
  key: (l: Listing) => string,
  value: (l: Listing) => string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of rows) {
    const k = key(l);
    const list = out[k] ?? (out[k] = []);
    const v = value(l);
    if (!list.includes(v)) list.push(v);
  }
  for (const k of Object.keys(out)) out[k]!.sort(byAr);
  return out;
}

/**
 * كتالوج الماركات والمحافظات — بديل `GET /v1/catalog/*` في وضع الموك.
 * مشتق من نفس داتا الموك عشان الاختيارات تبقى متسقة مع المخزون
 * ومايحصلش «موديل مش متحلّل» في المعاينة.
 */
export function getCatalog(): Catalog {
  const rows = db.listings;
  return {
    makes: uniqueSorted(rows.map((l) => l.make)),
    modelsByMake: groupUnique(rows, (l) => l.make, (l) => l.model),
    governorates: uniqueSorted(rows.map((l) => l.governorate)),
    areasByGov: groupUnique(rows, (l) => l.governorate, (l) => l.area),
    bodies: uniqueSorted(rows.map((l) => l.body)),
    colors: uniqueSorted(rows.map((l) => l.color)),
  };
}

/**
 * طلب الترقية بتاعي — بديل `GET /v1/exhibitions/applications/me` (§8.2).
 * `preferStatus` للديمو بس: بيرجّع طلب بالحالة المطلوبة عشان الخمس
 * شاشات في `/apply/status` تتراجع من غير قرار أدمن حقيقي.
 */
export function getMyApplication(preferStatus?: ApplicationStatus): ExhibitionApplication {
  const found = preferStatus
    ? db.applications.find((a) => a.status === preferStatus)
    : db.applications.find((a) => a.status === 'submitted');
  const app = found ?? db.applications[0];
  if (!app) throw new ApiError('NOT_FOUND', 'مفيش طلب ترقية لحسابك');
  return app;
}
