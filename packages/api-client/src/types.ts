/**
 * ════════════════════════════════════════════════════════════════
 * عقود البيانات — CarQ
 *
 * الأنواع دي مكتوبة يدوي **مؤقتًا**. لما الباك اند يطلّع
 * `/openapi.json` شغّل:
 *
 *     npx openapi-typescript http://localhost:8000/openapi.json -o src/schema.d.ts
 *
 * وبدّل الملف ده بإعادة تصدير من الـschema المتولّد
 * (ADMIN_DASHBOARD_SPEC §1 · §11). الأنواع المكتوبة بالإيد بتفضل
 * صح لحد أول تغيير في الباك — والمتولّدة بتفضل صح دايمًا.
 *
 * الأسماء camelCase زي ما الـAPI بيرجّعها.
 * الفلوس **أعداد صحيحة** على السلك (X-1) — مفيش كسور جنيه.
 * ════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════ عام ═══════════════════════ */

/** صفحة بالـcursor — نفس Page[T] في الباك */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** عقد الأخطاء (X-4): الرسالة بالعربي وجاهزة للعرض زي ما هي */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields: Record<string, string> | null;
  };
}

export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'LISTING_NOT_FOUND'
  | 'AUCTION_NOT_SETTLED'
  | 'ENTRY_NOT_PAID'
  | 'NOT_AN_EXHIBITION'
  | 'NOT_CONTRACTED'
  | 'CANNOT_BID_OWN_LISTING'
  | 'AUCTION_NOT_LIVE'
  | 'AUCTION_ENDED'
  | 'BID_TOO_LOW'
  | 'BID_NOT_ON_STEP';

/* ═══════════════════════ المستخدمين ═══════════════════════ */

export type UserRole = 'individual' | 'exhibition' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface User {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  governorate: string | null;
  area: string | null;
  listingsCount: number;
  createdAt: string;
  lastSeenAt: string | null;
  suspendedReason?: string | null;
  suspendedAt?: string | null;
}

/** ملخص البائع المضمّن في الصفوف — عشان الجدول مايعملش N+1 (§6.3) */
export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
}

/* ═══════════════════════ الإعلانات ═══════════════════════ */

/**
 * ٧ حالات كاملة. الموبايل بيشوف `active | sold` بس لأن الباك
 * بيـ«يسقّط» الحالات عليهم (L-5) — الداشبورد لازم تشوفهم كلهم.
 */
export type ListingStatus =
  | 'draft'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'expired'
  | 'removed'
  | 'rejected';

/** null = «مش متسعّر» — مفيش مقارنات كفاية (P-4). مش صفر ومش مخفي. */
export type PriceTag = 'deal' | 'fair' | 'high';

export type Transmission = 'أوتوماتيك' | 'مانيوال';

export interface Listing {
  id: string;
  title: string;
  make: string;
  model: string;
  year: number;
  price: number;
  /** null = محرك التسعير لسه مامعاهوش مقارنات كفاية */
  marketAvg: number | null;
  priceTag: PriceTag | null;
  km: number;
  /** شارة ثقة — الأدمن بس اللي بيمنحها (T-1) */
  kmVerified: boolean;
  /** شارة ثقة — الأدمن بس اللي بيمنحها (T-2) */
  inspected: boolean;
  transmission: Transmission;
  body: string;
  color: string;
  governorate: string;
  area: string;
  status: ListingStatus;
  viewsCount: number;
  photosCount: number;
  imageUrl: string | null;
  seller: UserSummary;
  description: string;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  rejectionReason?: string | null;
}

/** ملخص إعلان مضمّن في صفوف تانية (طلبات، مزادات، تمويل) */
export interface ListingSummary {
  id: string;
  title: string;
  year: number;
  price: number;
  km: number;
  governorate: string;
  imageUrl: string | null;
}

/* ═══════════════════════ بيع حالًا ═══════════════════════ */

/**
 * `accepted` = العربية **محجوزة** (listings.status = reserved) — مش متباعة.
 * `collected` هي اللي بتخليها sold (SN-7). خلط الاتنين معناه إن عربية
 * اتلغى استلامها هتفضل «متباعة» للأبد.
 */
export type SellNowStatus =
  | 'pending'
  | 'offered'
  | 'accepted'
  | 'collected'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface SellNowRequest {
  id: string;
  listing: ListingSummary;
  seller: UserSummary;
  status: SellNowStatus;
  /** round(price × 0.91 / 1000) × 1000 — محسوب في السيرفر (SN-1) */
  suggestedPrice: number;
  /** فاضي في pending — الأونر لسه ما أصدرش عرض */
  offerPrice: number | null;
  createdAt: string;
  offeredAt: string | null;
  /** صلاحية العرض ٢٤ ساعة (SN-3) */
  expiresAt: string | null;
  collectedAt: string | null;
}

/** فوقه بيستنى قرار بشري بدل العرض التلقائي (SN-2, D-4) */
export const AUTO_OFFER_CEILING = 1_500_000;
/** نسبة العرض التلقائي (SN-1) */
export const OFFER_RATIO = 0.91;

/* ═══════════════════════ المعارض ═══════════════════════ */

export interface Exhibition {
  id: string;
  userId: string;
  name: string;
  ownerName: string;
  phone: string | null;
  area: string;
  governorate: string;
  address: string | null;
  verified: boolean;
  /** المفتاح اللي بيحيي المزاد — الشرط ٢ من ٣ (A-1) */
  isContracted: boolean;
  contractStartsAt: string | null;
  contractEndsAt: string | null;
  commercialRegister: string | null;
  taxId: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  financingNote: string | null;
  inspectionService: boolean;
  listingsCount: number;
  bidsCount: number;
  winsCount: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export type ApplicationStatus = 'draft' | 'submitted' | 'needs_info' | 'approved' | 'rejected';

export type DocumentKind =
  | 'commercial_register'
  | 'tax_card'
  | 'owner_id_front'
  | 'owner_id_back'
  | 'venue_photo'
  | 'logo';

export interface ExhibitionApplication {
  id: string;
  userId: string;
  applicant: UserSummary;
  status: ApplicationStatus;
  name: string;
  ownerName: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  commercialRegister: string;
  taxId: string;
  /** مفاتيح تخزين خاصة — ممنوع تحطها في img src (F-6 · §10) */
  documents: Partial<Record<DocumentKind, string>>;
  inspectionService: boolean;
  financingNote: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** الحقول المطلوب استكمالها في needs_info */
  requestedFields?: string[];
}

/* ═══════════════════════ المزادات ═══════════════════════ */

export type AuctionStatus = 'live' | 'settled' | 'failed' | 'defaulted';

export interface Auction {
  id: string;
  listing: ListingSummary;
  /** لازم لتطبيق A-7: ممنوع تزايد على عربيتك */
  sellerId: string;
  /** ٨٥٪ من سعر الإعلان (A-2) */
  startPrice: number;
  currentBid: number;
  reservePrice: number | null;
  /** عمود في الداتابيز — **متعملهوش hard-code** (A-3) */
  bidStep: number;
  /** الرقم اللي الواجهة بتبعته زي ما هو — ممنوع تحسبه (A-3) */
  nextBid: number;
  bidsCount: number;
  status: AuctionStatus;
  endsAt: string;
  /** مرات التمديد المضاد للقنص — بحد أقصى ٢٠ (A-5) */
  extensionCount: number;
  winnerBidId: string | null;
  createdAt: string;
  /** حالة دخول المعرض الحالي — null يعني مش مسجّل */
  myEntry: { id: string; paid: boolean } | null;
}

export interface AuctionBid {
  id: string;
  auctionId: string;
  bidderId: string;
  /** علني جوه المزاد بالتصميم (A-12) — الاسم بس، من غير تليفون */
  exhibitionName: string;
  amount: number;
  createdAt: string;
}

export interface AuctionEntry {
  id: string;
  auctionId: string;
  auctionListingTitle: string;
  exhibitionId: string;
  exhibitionName: string;
  fee: number;
  /** null = لسه مادفعش — الشرط ٣ من ٣ (A-1) */
  paidAt: string | null;
  createdAt: string;
}

/* ═══════════════════════ التمويل ═══════════════════════ */

export type FinancingStatus = 'submitted' | 'contacted' | 'approved' | 'rejected';
export type DownTier = 0 | 30 | 50;
export type TermMonths = 12 | 24 | 36 | 48 | 60;

/**
 * مصدر الحقيقة للأرقام (F-4): فيه النسبة والمدة وأصل التمويل والقسط
 * **وقت التقديم**. متحسبش القسط من النسب الحالية — لو جميل غيّرت
 * النسبة، الطلب القديم لازم يفضل بأرقامه.
 */
export interface QuoteSnapshot {
  rate: number;
  termMonths: TermMonths;
  downTier: DownTier;
  downValue: number;
  principal: number;
  monthly: number;
  total: number;
  islamic: boolean;
  capturedAt: string;
}

export interface FinancingApplication {
  id: string;
  applicant: UserSummary;
  listing: ListingSummary;
  partnerSlug: string;
  downTier: DownTier;
  termMonths: TermMonths;
  islamic: boolean;
  quoteSnapshot: QuoteSnapshot;
  status: FinancingStatus;
  fullName: string;
  job: string;
  address: string;
  /** مفاتيح تخزين — ممنوع في img src. لازم رابط موقّع (F-6 · §10.1) */
  idFrontKey: string;
  idBackKey: string;
  idImagesDeletedAt: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/** رابط موقّع مؤقت لصورة بطاقة — ٥ دقايق، وكل فتحة متسجّلة */
export interface SignedImageUrl {
  url: string;
  expiresAt: string;
}

/* ═══════════════════════ المحادثات ═══════════════════════ */

export interface ChatThread {
  id: string;
  listing: ListingSummary;
  withName: string;
  withPhone: string;
  unread: number;
  lastMessage: string;
  lastMessageAt: string;
  messagesCount: number;
  /** زمن أول رد — مؤشر خدمة للمعرض */
  firstResponseMinutes: number | null;
}

/* ═══════════════════════ صحة النظام ═══════════════════════ */

export type ScanJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface ScanJob {
  id: string;
  listingId: string;
  listingTitle: string;
  status: ScanJobStatus;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
}

/**
 * كل المؤشرات دي أعراض لسبب واحد غالبًا: **الـworker** (§4.8).
 */
export interface HealthSnapshot {
  workerAlive: boolean;
  queuedScans: number;
  /** > ٥ دقايق = الـworker واقف */
  oldestQueuedScanSeconds: number;
  failedScans24h: number;
  /** > 0 = حرج: المزادات مش بتقفل */
  overdueAuctions: number;
  expiredSellNowOffers: number;
  expiredActiveListings: number;
  unpricedActivePct: number;
  idempotencyKeys: number;
  checkedAt: string;
}

/* ═══════════════════════ سجل التدقيق ═══════════════════════ */

export type AuditAction =
  | 'listing.flags_changed'
  | 'listing.status_changed'
  | 'exhibition.contract_changed'
  | 'exhibition.application_approved'
  | 'exhibition.application_rejected'
  | 'auction_entry.paid'
  | 'auction.created'
  | 'auction.settled'
  | 'auction.failed'
  | 'auction.defaulted'
  | 'sell_now.offered'
  | 'sell_now.collected'
  | 'user.role_changed'
  | 'user.status_changed'
  | 'financing.status_changed'
  | 'financing.id_image_viewed'
  | 'user.phone_revealed';

/** append-only — عمره ما بيتمسح (X-6) */
export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/* ═══════════════════════ الإحصائيات ═══════════════════════ */

export interface OverviewStats {
  listings: Record<ListingStatus, number>;
  users: { total: number; new: number; individual: number; exhibition: number; admin: number };
  sellNow: Record<'pending' | 'offered' | 'accepted' | 'collected', number>;
  auctions: Record<'live' | 'settled' | 'failed' | 'overdue', number>;
  financing: Record<FinancingStatus, number>;
  trust: {
    kmVerifiedPct: number;
    inspectedPct: number;
    withPhotosPct: number;
    pricedPct: number;
  };
  /** نفس الشكل للفترة السابقة — للدلتا */
  previous?: Omit<OverviewStats, 'previous'>;
}

export type TimeseriesMetric =
  | 'listings_published'
  | 'users_created'
  | 'sell_now_requests'
  | 'auction_bids'
  | 'chat_messages'
  | 'financing_applications'
  | 'scan_jobs';

/** الأيام الفاضية بترجع بصفر، **مش محذوفة** — غير كده الخط بيكدب (§6.2) */
export interface TimeseriesPoint {
  t: string;
  series: Record<string, number>;
}

export type BreakdownDimension =
  | 'make'
  | 'governorate'
  | 'price_tag'
  | 'listing_status'
  | 'body'
  | 'transmission'
  | 'price_bucket'
  | 'term_months'
  | 'down_tier';

export interface BreakdownBucket {
  key: string;
  count: number;
  value?: number;
}

export interface FunnelResult {
  steps: Array<{ key: string; label: string; count: number }>;
}

/** نطاق التاريخ — كل التجميع بتوقيت Africa/Cairo (X-2) */
export interface DateRange {
  from: string;
  to: string;
}

/* ═══════════════════════ المصادقة ═══════════════════════ */

export interface AuthSession {
  user: User;
  /** ١٥ دقيقة — في الذاكرة بس، مش localStorage (§2 · §10) */
  accessToken: string;
  expiresAt: number;
}

/* ═══════════════════════ إحصائيات المعرض ═══════════════════════ */

export interface ExhibitionStats {
  listedCars: number;
  views30d: number;
  newLeads: number;
  availableAuctions: number;
  highestBidderIn: number;
  wins30d: number;
  dueFees: number;
  avgDaysToSell: number | null;
  previous?: Omit<ExhibitionStats, 'previous'>;
}
