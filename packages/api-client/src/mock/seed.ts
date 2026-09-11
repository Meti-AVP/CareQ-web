/**
 * ════════════════════════════════════════════════════════════════
 * بيانات تجريبية — طبقة الاستبدال الوحيدة
 *
 * كل الشاشات بتقرا من هنا لحد ما الباك اند يجهز. التبديل بيحصل في
 * ملف واحد: `src/config.ts` (USE_MOCK = false) — الشاشات مش بتتغير.
 *
 * البيانات **مولّدة بمولّد عشوائي ببذرة ثابتة**: نفس الأرقام مع كل
 * تحميل، فالتشارتس مابترقصش والديمو بيتكرر بنفس الشكل.
 *
 * ملاحظة مهمة: البيانات دي مصمّمة عشان تعرض الحالات الصعبة اللي
 * المواصفة بتحذّر منها — إعلانات `draft` محبوسة، إعلانات مش متسعّرة
 * (marketAvg = null)، طلبات مستنية أكتر من ٢٤ ساعة، مزادات متأخرة عن
 * القفل، ومعارض مش متعاقدة. الديمو اللي بيعرض الحالة المثالية بس
 * بيخبّي المشاكل اللي الداشبورد اتعملت عشانها.
 * ════════════════════════════════════════════════════════════════
 */
import type {
  Auction,
  AuctionBid,
  AuctionEntry,
  AuditEntry,
  ChatThread,
  Exhibition,
  ExhibitionApplication,
  FinancingApplication,
  Listing,
  ListingStatus,
  ListingSummary,
  PriceTag,
  ScanJob,
  SellNowRequest,
  SellNowStatus,
  Transmission,
  User,
  UserSummary,
} from '../types';

/* ═══════════════════════ مولّد ببذرة ثابتة ═══════════════════════ */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    // mulberry32 — صغير وكفاية لبيانات عرض
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260911);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const int = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));
const chance = (p: number) => rng() < p;
const round1000 = (n: number) => Math.round(n / 1000) * 1000;

const NOW = new Date('2026-09-11T14:30:00+03:00').getTime();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const agoDays = (d: number) => iso(NOW - d * DAY);
const agoHours = (h: number) => iso(NOW - h * HOUR);
const inHours = (h: number) => iso(NOW + h * HOUR);

export const MOCK_NOW = NOW;

/* ═══════════════════════ قواميس السوق المصري ═══════════════════════ */

const MODELS: Record<string, string[]> = {
  هيونداي: ['أكسنت RB', 'إلنترا AD', 'توسان', 'كريتا', 'i10', 'فيرنا'],
  تويوتا: ['كورولا', 'ياريس', 'راف ٤', 'لاند كروزر', 'هايلكس', 'C-HR'],
  شيفروليه: ['أوبترا', 'أفيو', 'كابتيفا', 'كروز', 'لانوس'],
  نيسان: ['صني', 'قشقاي', 'جوك', 'سنترا', 'إكس تريل'],
  كيا: ['سيراتو', 'سبورتاج', 'بيجاس', 'ريو', 'سيلتوس'],
  مرسيدس: ['C180', 'E200', 'GLE 450', 'A200', 'S500'],
  'بي إم دبليو': ['320i', '420i', 'X3', 'X5', '520i'],
  'فولكس فاجن': ['جولف', 'باسات', 'تيجوان', 'بولو'],
  رينو: ['لوجان', 'داستر', 'ميجان', 'كابتور'],
  فيات: ['تيبو', '500', 'بونتو'],
  سكودا: ['أوكتافيا', 'سوبيرب', 'كاروك'],
  MG: ['MG5', 'ZS', 'RX5', 'HS'],
  شيري: ['تيجو 4 برو', 'أريزو 5', 'تيجو 8'],
  بيجو: ['301', '208', '3008'],
  أودي: ['A4', 'A6', 'Q5'],
  هوندا: ['سيفيك', 'CR-V'],
};
const MAKES = Object.keys(MODELS);

const GOVERNORATES = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'القليوبية',
  'الشرقية',
  'الدقهلية',
  'المنوفية',
  'الغربية',
  'بورسعيد',
  'أسيوط',
];

const AREAS: Record<string, string[]> = {
  القاهرة: ['مدينة نصر', 'المعادي', 'مصر الجديدة', 'التجمع الخامس', 'المقطم', 'الزمالك'],
  الجيزة: ['المهندسين', 'الدقي', '٦ أكتوبر', 'الشيخ زايد', 'الهرم', 'فيصل'],
  الإسكندرية: ['سموحة', 'سيدي جابر', 'المنتزه', 'العجمي', 'ميامي'],
  القليوبية: ['بنها', 'شبرا الخيمة', 'القناطر'],
  الشرقية: ['الزقازيق', 'العاشر من رمضان', 'بلبيس'],
  الدقهلية: ['المنصورة', 'طلخا', 'ميت غمر'],
  المنوفية: ['شبين الكوم', 'السادات', 'منوف'],
  الغربية: ['طنطا', 'المحلة الكبرى', 'كفر الزيات'],
  بورسعيد: ['بورفؤاد', 'الشرق', 'العرب'],
  أسيوط: ['أسيوط الجديدة', 'ديروط', 'أبنوب'],
};

const BODIES = ['سيدان', 'هاتشباك', 'SUV', 'كروس أوفر', 'كوبيه', 'بيك أب'];
const COLORS = ['أبيض', 'أسود', 'فضي', 'رمادي', 'أزرق', 'أحمر', 'بيچ'];
const TRANSMISSIONS: Transmission[] = ['أوتوماتيك', 'مانيوال'];

const FIRST = [
  'أحمد',
  'محمد',
  'مصطفى',
  'كريم',
  'عمر',
  'حسن',
  'يوسف',
  'إسلام',
  'طارق',
  'شريف',
  'منى',
  'سلمى',
  'ياسمين',
  'نهى',
  'دينا',
  'هبة',
  'مريم',
  'آية',
];
const LAST = [
  'سامي',
  'عبد الرحمن',
  'فتحي',
  'الجندي',
  'الشناوي',
  'رمضان',
  'عبد العزيز',
  'شعبان',
  'الشربيني',
  'مرسي',
  'زكي',
  'الهواري',
];

const EXHIBITION_NAMES = [
  'أوتو جروب',
  'معرض النخبة',
  'بريميوم موتورز',
  'الفارس للسيارات',
  'كار بوينت',
  'معرض الشروق',
  'إيليت كارز',
  'الحرية أوتو',
  'جولدن كارز',
  'المهندس للسيارات',
  'رويال موتورز',
  'سيتي كارز',
];

/** صور من نفس مجموعة التطبيق — بتتخدم من مجلد public للويب */
const CAR_IMAGES = [
  '/cars/accent.jpg',
  '/cars/corolla.jpg',
  '/cars/tucson.jpg',
  '/cars/sportage.jpg',
  '/cars/c180.jpg',
  '/cars/320i.jpg',
  '/cars/tiggo.jpg',
  '/cars/mg5.jpg',
  '/cars/duster.jpg',
  '/cars/octavia.jpg',
];

const monogram = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export const initials = monogram;

/* ═══════════════════════ المستخدمين ═══════════════════════ */

function phone(): string {
  return `01${pick(['0', '1', '2', '5'])}${int(10000000, 99999999)}`;
}

export const ADMIN_USER: User = {
  id: 'u-admin',
  name: 'مصطفى — مالك CarQ',
  phone: '01001234553',
  role: 'admin',
  status: 'active',
  governorate: 'القاهرة',
  area: 'التجمع الخامس',
  listingsCount: 0,
  createdAt: agoDays(420),
  lastSeenAt: agoHours(0.2),
};

const users: User[] = [ADMIN_USER];

for (let i = 0; i < 46; i++) {
  const gov = pick(GOVERNORATES);
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const created = int(1, 210);
  users.push({
    id: `u-${i + 1}`,
    name,
    phone: phone(),
    role: 'individual',
    status: chance(0.05) ? 'suspended' : 'active',
    governorate: gov,
    area: pick(AREAS[gov]!),
    listingsCount: 0,
    createdAt: agoDays(created),
    lastSeenAt: chance(0.85) ? agoHours(int(1, 300)) : null,
    suspendedReason: null,
    suspendedAt: null,
  });
}

/* ═══════════════════════ المعارض ═══════════════════════ */

const exhibitions: Exhibition[] = EXHIBITION_NAMES.map((name, i) => {
  const gov = pick(GOVERNORATES);
  const owner = `${pick(FIRST)} ${pick(LAST)}`;
  const exUser: User = {
    id: `u-ex-${i + 1}`,
    name: owner,
    phone: phone(),
    role: 'exhibition',
    status: 'active',
    governorate: gov,
    area: pick(AREAS[gov]!),
    listingsCount: 0,
    createdAt: agoDays(int(60, 300)),
    lastSeenAt: agoHours(int(1, 96)),
  };
  users.push(exUser);

  // ٥ من ١٢ بس متعاقدين — الباقي بيوضّح الحالة الافتراضية الحقيقية
  const contracted = i < 5;
  return {
    id: `ex-${i + 1}`,
    userId: exUser.id,
    name,
    ownerName: owner,
    phone: phone(),
    area: exUser.area!,
    governorate: gov,
    address: `${exUser.area} — ${int(1, 120)} شارع ${pick(['الجمهورية', 'النصر', 'التحرير', 'الهرم'])}`,
    verified: i < 9,
    isContracted: contracted,
    contractStartsAt: contracted ? agoDays(int(30, 200)) : null,
    // اتنين عقدهم قرب يخلص — بيوضّح ليه is_contracted بوليان مش كفاية
    contractEndsAt: contracted ? inHours(i === 0 ? 240 : i === 1 ? 72 : int(1000, 6000)) : null,
    commercialRegister: `CR-${int(100000, 999999)}`,
    taxId: `${int(100, 999)}-${int(100, 999)}-${int(100, 999)}`,
    logoUrl: null,
    coverUrl: null,
    financingNote: chance(0.6) ? 'تمويل حتى ٥ مليون بالتعاون مع جميل للتمويل' : null,
    inspectionService: chance(0.5),
    listingsCount: 0,
    bidsCount: 0,
    winsCount: 0,
    lastActiveAt: agoHours(int(1, 200)),
    createdAt: exUser.createdAt,
  };
});

const toSummary = (u: User): UserSummary => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role,
});

/* ═══════════════════════ الإعلانات ═══════════════════════ */

const sellers = users.filter((u) => u.role !== 'admin');

/**
 * توزيع الحالات مقصود: `draft` عالي نسبيًا عشان مؤشر الإنذار في
 * لوحة النظرة العامة يبان شغال (رفع الصور باظ = D-2).
 */
const STATUS_POOL: ListingStatus[] = [
  ...Array<ListingStatus>(58).fill('active'),
  ...Array<ListingStatus>(14).fill('draft'),
  ...Array<ListingStatus>(12).fill('sold'),
  ...Array<ListingStatus>(5).fill('reserved'),
  ...Array<ListingStatus>(6).fill('expired'),
  ...Array<ListingStatus>(3).fill('removed'),
  ...Array<ListingStatus>(2).fill('rejected'),
];

function priceFor(make: string, year: number): number {
  const premium = ['مرسيدس', 'بي إم دبليو', 'أودي'].includes(make) ? 3.1 : 1;
  const base = 380_000 + (year - 2010) * 92_000;
  return round1000(base * premium * (0.82 + rng() * 0.4));
}

const listings: Listing[] = [];

for (let i = 0; i < 190; i++) {
  const make = pick(MAKES);
  const model = pick(MODELS[make]!);
  const year = int(2012, 2025);
  const gov = pick(GOVERNORATES);
  const seller = pick(sellers);
  const status = pick(STATUS_POOL);
  const price = priceFor(make, year);

  // «مش متسعّر» حالة حقيقية: محرك التسعير عايز مقارنات كفاية (P-4)
  const priced = chance(0.79);
  const marketAvg = priced ? round1000(price * (0.86 + rng() * 0.3)) : null;
  let priceTag: PriceTag | null = null;
  if (marketAvg !== null) {
    const ratio = price / marketAvg;
    priceTag = ratio < 0.93 ? 'deal' : ratio > 1.08 ? 'high' : 'fair';
  }

  const isDraft = status === 'draft';
  // الإعلان من غير صور بيفضل draft (D-2) — ده سبب أغلب الـdrafts
  const photosCount = isDraft ? (chance(0.7) ? 0 : int(1, 2)) : int(3, 9);
  const publishedDaysAgo = int(1, 120);

  listings.push({
    id: `l-${i + 1}`,
    title: `${make} ${model}`,
    make,
    model,
    year,
    price,
    marketAvg,
    priceTag,
    km: int(8, 260) * 1000,
    kmVerified: !isDraft && chance(0.31),
    inspected: !isDraft && chance(0.22),
    transmission: pick(TRANSMISSIONS),
    body: pick(BODIES),
    color: pick(COLORS),
    governorate: gov,
    area: pick(AREAS[gov]!),
    status,
    viewsCount: isDraft ? 0 : int(12, 2400),
    photosCount,
    imageUrl: photosCount > 0 ? pick(CAR_IMAGES) : null,
    seller: toSummary(seller),
    description: `${make} ${model} موديل ${year} — الصيانات بالتوكيل، فابريكا بالكامل، والعربية بحالة ممتازة.`,
    publishedAt: isDraft ? null : agoDays(publishedDaysAgo),
    expiresAt: isDraft ? null : iso(NOW - publishedDaysAgo * DAY + 30 * DAY),
    createdAt: agoDays(publishedDaysAgo + (isDraft ? 0 : int(0, 3))),
    rejectionReason: status === 'rejected' ? 'صور مكررة من إعلان تاني' : null,
  });
}

// عدّادات الإعلانات لكل مستخدم/معرض
for (const l of listings) {
  const u = users.find((x) => x.id === l.seller.id);
  if (u) u.listingsCount += 1;
  const ex = exhibitions.find((x) => x.userId === l.seller.id);
  if (ex) ex.listingsCount += 1;
}

const listingSummary = (l: Listing): ListingSummary => ({
  id: l.id,
  title: `${l.title} ${l.year}`,
  year: l.year,
  price: l.price,
  km: l.km,
  governorate: l.governorate,
  imageUrl: l.imageUrl,
});

/* ═══════════════════════ بيع حالًا ═══════════════════════ */

const sellNow: SellNowRequest[] = [];
const sellNowPool = listings.filter((l) => l.status === 'active' || l.status === 'reserved');

/**
 * التوزيع مقصود: **٩ طلبات `pending`** — دي الشاشة اللي المواصفة
 * بتقول عليها الأهم، ولازم تبان مليانة. و٣ منهم مستنيين فوق ٢٤ ساعة
 * عشان تلوين الـSLA يتشاف شغال.
 */
const SN_PLAN: Array<{ status: SellNowStatus; count: number }> = [
  { status: 'pending', count: 9 },
  { status: 'offered', count: 7 },
  { status: 'accepted', count: 4 },
  { status: 'collected', count: 6 },
  { status: 'declined', count: 3 },
  { status: 'expired', count: 2 },
];

let snIdx = 0;
for (const plan of SN_PLAN) {
  for (let i = 0; i < plan.count; i++) {
    const listing = sellNowPool[(snIdx * 7) % sellNowPool.length]!;
    const seller = users.find((u) => u.id === listing.seller.id)!;
    const suggested = round1000(listing.price * 0.91);
    const isPending = plan.status === 'pending';
    // أول ٣ pending مستنيين فوق ٢٤ ساعة — تجاوز SLA حقيقي
    const createdH = isPending ? (i < 3 ? int(26, 70) : int(1, 20)) : int(30, 400);
    const offered = !isPending && plan.status !== 'cancelled';
    const offerPrice = offered
      ? round1000(suggested * (0.94 + rng() * 0.1))
      : null;

    sellNow.push({
      id: `sn-${snIdx + 1}`,
      listing: listingSummary(listing),
      seller: toSummary(seller),
      status: plan.status,
      suggestedPrice: suggested,
      offerPrice,
      createdAt: agoHours(createdH),
      offeredAt: offered ? agoHours(createdH - int(1, 8)) : null,
      expiresAt: offered ? iso(NOW - (createdH - int(1, 8)) * HOUR + 24 * HOUR) : null,
      collectedAt: plan.status === 'collected' ? agoHours(int(1, 100)) : null,
    });
    snIdx++;
  }
}

/* ═══════════════════════ المزادات ═══════════════════════ */

const contractedExhibitions = exhibitions.filter((e) => e.isContracted);
const auctions: Auction[] = [];
const bids: AuctionBid[] = [];
const entries: AuctionEntry[] = [];

const AUCTION_PLAN: Array<{ status: Auction['status']; count: number }> = [
  { status: 'live', count: 6 },
  { status: 'settled', count: 9 },
  { status: 'failed', count: 3 },
  { status: 'defaulted', count: 1 },
];

let aIdx = 0;
for (const plan of AUCTION_PLAN) {
  for (let i = 0; i < plan.count; i++) {
    const listing = sellNowPool[(aIdx * 13 + 5) % sellNowPool.length]!;
    // سعر البداية ٨٥٪ من سعر الإعلان (A-2)
    const startPrice = round1000(listing.price * 0.85);
    const bidStep = 25_000;
    const isLive = plan.status === 'live';
    const bidCount = plan.status === 'failed' ? 0 : int(3, 14);
    const currentBid = bidCount > 0 ? startPrice + bidCount * bidStep : startPrice;

    /**
     * أول مزاد «متأخر عن القفل»: status لسه live و endsAt عدى.
     * ده العَرَض اللي بيكشف إن الـworker واقف (§4.5 · §4.8) —
     * ولازم يبان في لوحة الصحة وبانر أحمر.
     */
    const overdue = isLive && i === 0;
    const endsAt = overdue
      ? agoHours(5)
      : isLive
        ? inHours(i === 1 ? 0.07 : i === 2 ? 1.4 : int(6, 70))
        : agoDays(int(1, 30));

    const auctionId = `a-${aIdx + 1}`;
    auctions.push({
      id: auctionId,
      listing: listingSummary(listing),
      sellerId: listing.seller.id,
      startPrice,
      currentBid,
      reservePrice: chance(0.5) ? round1000(listing.price * 0.95) : null,
      bidStep,
      // الواجهة بتبعت الرقم ده زي ما هو — ممنوع تحسبه (A-3)
      nextBid: currentBid + bidStep,
      bidsCount: bidCount,
      status: plan.status,
      endsAt,
      extensionCount: isLive ? int(0, 4) : int(0, 9),
      winnerBidId: null,
      createdAt: agoDays(int(2, 40)),
      myEntry: null,
    });

    for (let b = 0; b < bidCount; b++) {
      const ex = contractedExhibitions[(aIdx + b) % contractedExhibitions.length]!;
      const bidId = `b-${auctionId}-${b + 1}`;
      bids.push({
        id: bidId,
        auctionId,
        bidderId: ex.id,
        exhibitionName: ex.name,
        amount: startPrice + (b + 1) * bidStep,
        createdAt: iso(new Date(endsAt).getTime() - (bidCount - b) * 42 * 60_000),
      });
      ex.bidsCount += 1;
      if (b === bidCount - 1) {
        auctions[auctions.length - 1]!.winnerBidId =
          plan.status === 'settled' || plan.status === 'defaulted' ? bidId : null;
        if (plan.status === 'settled') ex.winsCount += 1;
      }
    }

    // رسوم الدخول: بعضها مدفوع وبعضها لأ — الطابور اللي الأدمن بيأكده
    for (let e = 0; e < int(2, 5); e++) {
      const ex = contractedExhibitions[(aIdx * 3 + e) % contractedExhibitions.length]!;
      if (entries.some((x) => x.auctionId === auctionId && x.exhibitionId === ex.id)) continue;
      entries.push({
        id: `en-${auctionId}-${ex.id}`,
        auctionId,
        auctionListingTitle: listingSummary(listing).title,
        exhibitionId: ex.id,
        exhibitionName: ex.name,
        // fee لسه 0 في الباك — قرار تجاري مطلوب (§8.3 بند ٦)
        fee: 0,
        paidAt: chance(0.62) ? agoDays(int(1, 20)) : null,
        createdAt: agoDays(int(2, 30)),
      });
    }
    aIdx++;
  }
}

/* ═══════════════════════ طلبات ترقية المعارض ═══════════════════════ */

const applications: ExhibitionApplication[] = [
  'submitted',
  'submitted',
  'submitted',
  'needs_info',
  'approved',
  'rejected',
].map((status, i) => {
  const applicant = users.filter((u) => u.role === 'individual')[i + 3]!;
  const gov = applicant.governorate ?? 'القاهرة';
  return {
    id: `app-${i + 1}`,
    userId: applicant.id,
    applicant: toSummary(applicant),
    status: status as ExhibitionApplication['status'],
    name: `معرض ${pick(['الأمانة', 'التوفيق', 'النور', 'الصفوة', 'المستقبل', 'الأصيل'])} للسيارات`,
    ownerName: applicant.name,
    phone: applicant.phone,
    governorate: gov,
    area: applicant.area ?? pick(AREAS[gov]!),
    address: `${applicant.area} — ${int(1, 99)} شارع ${pick(['الجيش', 'النيل', 'المحطة'])}`,
    commercialRegister: `CR-${int(100000, 999999)}`,
    taxId: `${int(100, 999)}-${int(100, 999)}-${int(100, 999)}`,
    documents: {
      commercial_register: `private/exh/app-${i + 1}/cr.jpg`,
      tax_card: `private/exh/app-${i + 1}/tax.jpg`,
      owner_id_front: `private/exh/app-${i + 1}/id-front.jpg`,
      owner_id_back: `private/exh/app-${i + 1}/id-back.jpg`,
    },
    inspectionService: chance(0.5),
    financingNote: 'تمويل بالتعاون مع البنوك الشريكة',
    reviewNote:
      status === 'needs_info'
        ? 'صورة السجل التجاري غير واضحة — محتاجين نسخة أوضح وسارية'
        : status === 'rejected'
          ? 'الرقم الضريبي غير مطابق للسجل التجاري'
          : null,
    requestedFields: status === 'needs_info' ? ['commercial_register'] : undefined,
    reviewedBy: status === 'approved' || status === 'rejected' ? ADMIN_USER.id : null,
    reviewedAt: status === 'approved' || status === 'rejected' ? agoDays(int(2, 20)) : null,
    createdAt: agoDays(int(1, 25)),
  };
});

/* ═══════════════════════ التمويل ═══════════════════════ */

/** نسب جميل للتمويل — نفس أرقام التطبيق (data/financing.ts) */
const RATES: Record<0 | 30 | 50, Record<number, number>> = {
  0: { 12: 17.1, 24: 17.2, 36: 17.8, 48: 18.4, 60: 19.0 },
  30: { 12: 16.6, 24: 16.7, 36: 17.2, 48: 17.8, 60: 18.4 },
  50: { 12: 16.6, 24: 16.7, 36: 17.2, 48: 17.8, 60: 18.4 },
};

const financing: FinancingApplication[] = [];
const FIN_PLAN: Array<[FinancingApplication['status'], number]> = [
  ['submitted', 11],
  ['contacted', 8],
  ['approved', 7],
  ['rejected', 4],
];

let fIdx = 0;
for (const [status, count] of FIN_PLAN) {
  for (let i = 0; i < count; i++) {
    const listing = sellNowPool[(fIdx * 11 + 3) % sellNowPool.length]!;
    const applicant = pick(users.filter((u) => u.role === 'individual'));
    const downTier = pick([0, 30, 50] as const);
    const termMonths = pick([12, 24, 36, 48, 60] as const);
    const rate = RATES[downTier][termMonths]!;
    const downValue = Math.round((listing.price * downTier) / 100);
    const principal = listing.price - downValue;
    const total = Math.round(principal * (1 + (rate / 100) * (termMonths / 12)));
    const monthly = Math.round(total / termMonths / 100) * 100;
    // أول ٣ submitted مستنيين فوق ٢٤ ساعة — نفس عتبة SLA بتاعة بيع حالًا
    const createdH = status === 'submitted' ? (i < 3 ? int(26, 60) : int(1, 20)) : int(40, 600);

    financing.push({
      id: `fa-${fIdx + 1}`,
      applicant: toSummary(applicant),
      listing: listingSummary(listing),
      partnerSlug: 'jameel',
      downTier,
      termMonths,
      islamic: chance(0.35),
      quoteSnapshot: {
        rate,
        termMonths,
        downTier,
        downValue,
        principal,
        monthly,
        total,
        islamic: false,
        capturedAt: agoHours(createdH),
      },
      status,
      fullName: applicant.name,
      job: pick(['مهندس', 'محاسب', 'طبيب', 'مدرس', 'موظف حكومي', 'صاحب محل', 'صيدلي']),
      address: `${applicant.governorate} — ${applicant.area}`,
      idFrontKey: `private/fin/fa-${fIdx + 1}/id-front.jpg`,
      idBackKey: `private/fin/fa-${fIdx + 1}/id-back.jpg`,
      idImagesDeletedAt: status === 'rejected' && chance(0.5) ? agoDays(int(1, 10)) : null,
      createdAt: agoHours(createdH),
      reviewedBy: status === 'submitted' ? null : ADMIN_USER.id,
      reviewedAt: status === 'submitted' ? null : agoHours(createdH - int(2, 20)),
    });
    fIdx++;
  }
}

/* ═══════════════════════ مهام السكان ═══════════════════════ */

/**
 * ٧ مهام `queued` وأقدمها من ٤٠ دقيقة = **الـworker واقف**.
 * ده مش تزويق: الـworker مش منشور في الإنتاج، ولوحة الصحة اتعملت
 * عشان تخلّي العطل ده مرئي بدل ما يفضل صامت (§4.8).
 */
const scanJobs: ScanJob[] = [];
for (let i = 0; i < 7; i++) {
  const l = pick(listings);
  scanJobs.push({
    id: `sj-q-${i + 1}`,
    listingId: l.id,
    listingTitle: `${l.title} ${l.year}`,
    status: 'queued',
    createdAt: agoHours(i === 0 ? 0.67 : rng() * 0.5),
    finishedAt: null,
    error: null,
  });
}
for (let i = 0; i < 34; i++) {
  const l = pick(listings);
  const failed = i < 5;
  const created = agoHours(int(1, 72));
  scanJobs.push({
    id: `sj-${i + 1}`,
    listingId: l.id,
    listingTitle: `${l.title} ${l.year}`,
    status: failed ? 'failed' : 'done',
    createdAt: created,
    finishedAt: iso(new Date(created).getTime() + int(40, 600) * 1000),
    error: failed ? 'فشل تحليل الصور — جودة غير كافية لقراءة العداد' : null,
  });
}

/* ═══════════════════════ سجل التدقيق ═══════════════════════ */

const auditLog: AuditEntry[] = [];
const AUDIT_SAMPLES: Array<[AuditEntry['action'], string, string]> = [
  ['listing.flags_changed', 'listing', 'تفعيل «ممشى موثّق» — العداد مقروء من صورة اللوحة'],
  ['exhibition.contract_changed', 'exhibition', 'تفعيل التعاقد بعد استلام العقد الموقّع'],
  ['auction_entry.paid', 'auction_entry', 'تأكيد تحويل رسوم الدخول'],
  ['sell_now.offered', 'sell_now_request', 'إصدار عرض بعد مراجعة حالة العربية'],
  ['sell_now.collected', 'sell_now_request', 'تم استلام العربية وتحويل المبلغ'],
  ['auction.settled', 'auction', 'تسوية تلقائية بانتهاء المدة'],
  ['user.role_changed', 'user', 'ترقية لحساب معرض بعد اعتماد الأوراق'],
  ['financing.id_image_viewed', 'financing_application', 'فتح صورة بطاقة لمراجعة الطلب'],
  ['listing.status_changed', 'listing', 'رفض الإعلان — صور مكررة'],
];
for (let i = 0; i < 64; i++) {
  const [action, entityType, note] = AUDIT_SAMPLES[i % AUDIT_SAMPLES.length]!;
  auditLog.push({
    id: `au-${i + 1}`,
    actorId: ADMIN_USER.id,
    actorName: ADMIN_USER.name,
    action,
    entityType,
    entityId: `${entityType}-${int(1, 90)}`,
    payload: { note },
    createdAt: agoHours(i * 5 + rng() * 4),
  });
}
auditLog.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

/* ═══════════════════════ المحادثات (استفسارات المعرض) ═══════════════════════ */

const chats: ChatThread[] = Array.from({ length: 14 }).map((_, i) => {
  const l = listings[(i * 9) % listings.length]!;
  const buyer = pick(users.filter((u) => u.role === 'individual'));
  return {
    id: `t-${i + 1}`,
    listing: listingSummary(l),
    withName: buyer.name,
    withPhone: buyer.phone,
    unread: i < 4 ? int(1, 3) : 0,
    lastMessage: pick([
      'العربية لسه متاحة؟',
      'آخر سعر كام؟ معايا كاش',
      'ينفع معاينة بكرة بالليل؟',
      'الصيانات كلها بالتوكيل؟',
      'في إمكانية تقسيط؟',
    ]),
    lastMessageAt: agoHours(int(1, 120)),
    messagesCount: int(2, 18),
    firstResponseMinutes: chance(0.8) ? int(3, 240) : null,
  };
});

/* ═══════════════════════ التصدير ═══════════════════════ */

export const seed = {
  users,
  exhibitions,
  listings,
  sellNow,
  auctions,
  bids,
  entries,
  applications,
  financing,
  scanJobs,
  auditLog,
  chats,
  listingSummary,
  toSummary,
  GOVERNORATES,
  MAKES,
  AREAS,
};
