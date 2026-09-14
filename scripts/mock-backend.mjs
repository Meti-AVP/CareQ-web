#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════
 * سيرفر موك Node بسيط — المرحلة ٥ (MISSION §5 بند ١)
 *
 * الهدف: اختبار الادعاء المكتوب في README فعليًا — «التبديل للباك اند
 * مش إعادة كتابة، `USE_MOCK` بيتحوّل لـ`false` لوحده أول ما يلاقي عنوان
 * API». السيرفر ده بيرد بعقود حقيقية (نفس الأشكال في `types.ts`) على
 * أهم الشاشات في التطبيقين، عشان نشغّل `NEXT_PUBLIC_API_URL` عليه
 * ونتصفح فعليًا — مش قراءة كود بس.
 *
 * تشغيل: `node scripts/mock-backend.mjs` (بورت ٤٠٠٠ افتراضيًا)
 * ثم: `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev:admin`
 *      `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev:dealers`
 *
 * دخول تجريبي: أي رقم مصري صحيح + أي كود ٦ أرقام.
 *   - `01001234567` أو أي رقم تاني → دور `exhibition` (بوابة المعارض)
 *   - `01000000000` → دور `admin` (لوحة الأدمن)
 *
 * ده **مش** محاكاة كاملة لكل الـ٦٠+ endpoint في المشروع — غطّى العينة
 * الكافية لتشغيل الشاشات الأساسية في التطبيقين وإثبات/نفي الادعاء.
 * أي مسار مش متغطّى بيرجّع ٥٠١ بشكل خطأ X-4 الصحيح (مش HTML/كراش) —
 * وده بذات نفسه دليل مفيد: هل الواجهة بتتعامل مع endpoint ناقص بلطف؟
 * ════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ?? 4000;
const now = () => new Date().toISOString();

/* ═══════════════════════ بيانات بذرة ═══════════════════════ */

const ADMIN_USER = { id: 'u-admin', name: 'مدير النظام', phone: '01000000000', role: 'admin', status: 'active', governorate: null, area: null, listingsCount: 0, createdAt: now(), lastSeenAt: now() };
const EXH_USER = { id: 'u-exh-1', name: 'محمد سامي', phone: '01001234567', role: 'exhibition', status: 'active', governorate: 'القاهرة', area: 'مدينة نصر', listingsCount: 2, createdAt: now(), lastSeenAt: now() };

const EXHIBITION = {
  id: 'ex-1', userId: EXH_USER.id, name: 'أوتو جروب', ownerName: 'محمد سامي', phone: EXH_USER.phone,
  area: 'مدينة نصر', governorate: 'القاهرة', address: 'شارع عباس العقاد',
  verified: true, isContracted: true, contractStartsAt: now(), contractEndsAt: null,
  commercialRegister: '12345', taxId: '54321', logoUrl: null, coverUrl: null,
  financingNote: null, inspectionService: true, listingsCount: 2, bidsCount: 3, winsCount: 1,
  lastActiveAt: now(), createdAt: now(),
};

const SELLER_SUMMARY = { id: EXH_USER.id, name: EXH_USER.name, phone: EXH_USER.phone, role: 'exhibition' };

const listings = [
  { id: 'l-1', title: 'تويوتا كورولا', make: 'تويوتا', model: 'كورولا', year: 2021, price: 740000, marketAvg: 720000, priceTag: 'fair', km: 42000, kmVerified: true, inspected: true, transmission: 'أوتوماتيك', body: 'سيدان', color: 'أبيض', governorate: 'القاهرة', area: 'مدينة نصر', status: 'active', viewsCount: 340, photosCount: 4, imageUrl: null, seller: SELLER_SUMMARY, description: 'فابريكا بالكامل', publishedAt: now(), expiresAt: null, createdAt: now() },
  { id: 'l-2', title: 'هيونداي إلنترا', make: 'هيونداي', model: 'إلنترا', year: 2020, price: 610000, marketAvg: null, priceTag: null, km: 61000, kmVerified: false, inspected: false, transmission: 'مانيوال', body: 'سيدان', color: 'فضي', governorate: 'القاهرة', area: 'مدينة نصر', status: 'draft', viewsCount: 0, photosCount: 0, imageUrl: null, seller: SELLER_SUMMARY, description: 'عربية نظيفة', publishedAt: null, expiresAt: null, createdAt: now() },
];

const auctions = [
  {
    id: 'a-1', listing: { id: 'l-1', title: 'تويوتا كورولا', year: 2021, price: 740000, km: 42000, governorate: 'القاهرة', imageUrl: null },
    sellerId: 'u-other', startPrice: 629000, currentBid: 655000, reservePrice: null, bidStep: 5000,
    nextBid: 660000, bidsCount: 3, status: 'live', endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    extensionCount: 0, winnerBidId: null, createdAt: now(),
    myEntry: { id: 'ae-1', paid: true }, topBid: { exhibitionName: 'معرض النصر', amount: 655000 },
  },
];

const bidsByAuction = { 'a-1': [
  { id: 'b-1', auctionId: 'a-1', bidderId: 'u-other-1', exhibitionName: 'معرض النصر', amount: 655000, createdAt: now() },
  { id: 'b-2', auctionId: 'a-1', bidderId: EXHIBITION.id, exhibitionName: EXHIBITION.name, amount: 645000, createdAt: now() },
] };

const entries = [
  { id: 'ae-1', auctionId: 'a-1', auctionListingTitle: 'تويوتا كورولا', exhibitionId: EXHIBITION.id, exhibitionName: EXHIBITION.name, fee: 500, paidAt: now(), createdAt: now() },
];

const chats = [
  { id: 'c-1', listing: { id: 'l-1', title: 'تويوتا كورولا', year: 2021, price: 740000, km: 42000, governorate: 'القاهرة', imageUrl: null }, withName: 'أحمد فتحي', withPhone: '01099998888', unread: 1, lastMessage: 'العربية لسه موجودة؟', lastMessageAt: now(), messagesCount: 3, firstResponseMinutes: 12 },
];
const messagesByChat = { 'c-1': [
  { id: 'm-1', threadId: 'c-1', from: 'buyer', body: 'العربية لسه موجودة؟', at: now() },
] };

const sellNowRequests = [
  { id: 'sn-1', listing: { id: 'l-1', title: 'تويوتا كورولا', year: 2021, price: 740000, km: 42000, governorate: 'القاهرة', imageUrl: null }, seller: SELLER_SUMMARY, status: 'pending', suggestedPrice: 673000, offerPrice: null, createdAt: now(), offeredAt: null, expiresAt: null, collectedAt: null },
];

const auditEntries = [
  { id: 'au-1', actorId: ADMIN_USER.id, actorName: ADMIN_USER.name, action: 'exhibition.contract_changed', entityType: 'exhibition', entityId: EXHIBITION.id, payload: { is_contracted: true }, createdAt: now() },
];

const CATALOG_MAKES = [
  { name: 'تويوتا', models: ['كورولا', 'ياريس'] },
  { name: 'هيونداي', models: ['إلنترا', 'أكسنت'] },
];
const CATALOG_GOVS = [{ name: 'القاهرة', areas: ['مدينة نصر', 'المعادي'] }];

/* ═══════════════════════ توكنات — ديمو، بلا تعقيد ═══════════════════════ */

const refreshTokens = new Map(); // refreshToken -> userId
const accessTokens = new Map(); // accessToken -> userId

function issueTokens(userId) {
  const access = `mock-access-${randomUUID()}`;
  const refresh = `mock-refresh-${randomUUID()}`;
  accessTokens.set(access, userId);
  refreshTokens.set(refresh, userId);
  return { access, refresh };
}

function userById(id) {
  return id === ADMIN_USER.id ? ADMIN_USER : EXH_USER;
}

function authedUser(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? accessTokens.get(token) : null;
  return userId ? userById(userId) : null;
}

/* ═══════════════════════ أدوات رد ═══════════════════════ */

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function errorBody(code, message) {
  return { error: { code, message, fields: null } };
}

function page(items, limit = 25) {
  return { items: items.slice(0, limit), nextCursor: null, total: items.length };
}

async function readJsonBody(req) {
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.includes('multipart/form-data')) {
    // مانفكّش الـmultipart فعليًا — بس نتأكد إن فيه بايتات جاية،
    // وده اللي كان الباج (§P0) بيمنعه خالص قبل إصلاح client.ts
    let size = 0;
    for await (const chunk of req) size += chunk.length;
    return { __multipartBytes: size };
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* ═══════════════════════ الراوتر ═══════════════════════ */

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, pattern, handler });

on('POST', /^\/v1\/auth\/otp\/request$/, async (req, res) => {
  await readJsonBody(req);
  res.writeHead(204).end();
});

on('POST', /^\/v1\/auth\/otp\/verify$/, async (req, res) => {
  const body = await readJsonBody(req);
  const phone = String(body.phone ?? '');
  const code = String(body.code ?? '');
  if (!code || code.length < 4) return send(res, 400, errorBody('VALIDATION_ERROR', 'اكتب الكود كامل'));
  const user = phone.replace(/\D/g, '') === '01000000000' ? ADMIN_USER : EXH_USER;
  const { access, refresh } = issueTokens(user.id);
  send(res, 200, { access_token: access, refresh_token: refresh, user });
});

on('POST', /^\/v1\/auth\/refresh$/, async (req, res) => {
  const body = await readJsonBody(req);
  const current = String(body.refresh_token ?? '');
  const userId = refreshTokens.get(current);
  if (!userId) return send(res, 401, errorBody('NOT_AUTHENTICATED', 'الجلسة انتهت — سجّل دخول تاني'));
  refreshTokens.delete(current);
  const { access, refresh } = issueTokens(userId);
  send(res, 200, { access_token: access, expires_in: 900, refresh_token: refresh });
});

on('GET', /^\/v1\/me$/, (req, res) => {
  const user = authedUser(req);
  if (!user) return send(res, 401, errorBody('NOT_AUTHENTICATED', 'سجّل دخول الأول'));
  send(res, 200, user);
});

/* ── كتالوج (بوابة المعارض) ── */
on('GET', /^\/v1\/catalog\/makes$/, (req, res) => send(res, 200, { items: CATALOG_MAKES }));
on('GET', /^\/v1\/catalog\/governorates$/, (req, res) => send(res, 200, { items: CATALOG_GOVS }));
on('GET', /^\/v1\/catalog\/filters$/, (req, res) => send(res, 200, { bodies: ['سيدان', 'هاتشباك'], colors: ['أبيض', 'أسود'] }));

/* ── المعرض الحالي ── */
on('GET', /^\/v1\/exhibitions\/me$/, (req, res) => send(res, 200, EXHIBITION));
on('PATCH', /^\/v1\/exhibitions\/me$/, async (req, res) => {
  const patch = await readJsonBody(req);
  Object.assign(EXHIBITION, patch);
  send(res, 200, EXHIBITION);
});
on('GET', /^\/v1\/me\/exhibition\/stats$/, (req, res) =>
  send(res, 200, { listedCars: 2, views30d: 340, newLeads: 1, availableAuctions: 1, highestBidderIn: 0, wins30d: 1, dueFees: 0, avgDaysToSell: 14 }),
);
on('GET', /^\/v1\/me\/exhibition\/entries$/, (req, res) => send(res, 200, { items: entries }));

/* ── الإعلانات ──
 * فحص ملكية إجباري (FND-052, P0 — docs/BACKEND-CONTRACT.md §6.0):
 * إعلان معرض تاني لازم يرجّع 403، مش بياناته. `findOwnedListing` بترجع
 * null لو مش لاقي الإعلان أو مش بتاع صاحب التوكن — الاتنين بيتفرقوا في
 * كود الخطأ (404 مقابل 403) عشان الرسالة تكون دقيقة. */
function findOwnedListing(req, id, res) {
  const l = listings.find((x) => x.id === id);
  if (!l) {
    send(res, 404, errorBody('LISTING_NOT_FOUND', 'الإعلان مش موجود'));
    return null;
  }
  const user = authedUser(req);
  if (!user) {
    send(res, 401, errorBody('NOT_AUTHENTICATED', 'سجّل دخول الأول'));
    return null;
  }
  if (l.seller.id !== user.id) {
    send(res, 403, errorBody('FORBIDDEN', 'الإعلان ده مش بتاع معرضك'));
    return null;
  }
  return l;
}

on('GET', /^\/v1\/me\/listings$/, (req, res) => send(res, 200, { items: listings }));
on('GET', /^\/v1\/listings\/([^/]+)$/, (req, res, m) => {
  const l = findOwnedListing(req, m[1], res);
  if (l) send(res, 200, l);
});
on('POST', /^\/v1\/listings$/, async (req, res) => {
  const body = await readJsonBody(req);
  const l = { id: `l-${randomUUID().slice(0, 8)}`, title: `${body.make ?? ''} ${body.model ?? ''}`.trim(), make: body.make ?? '', model: body.model ?? '', year: body.year ?? 2020, price: body.price ?? 0, marketAvg: null, priceTag: null, km: body.km ?? 0, kmVerified: false, inspected: false, transmission: body.transmission ?? 'أوتوماتيك', body: body.body ?? '', color: body.color ?? '', governorate: body.governorate ?? '', area: body.area ?? '', status: 'draft', viewsCount: 0, photosCount: 0, imageUrl: null, seller: SELLER_SUMMARY, description: body.description ?? '', publishedAt: null, expiresAt: null, createdAt: now() };
  listings.push(l);
  send(res, 200, l);
});
on('PATCH', /^\/v1\/listings\/([^/]+)$/, async (req, res, m) => {
  const l = findOwnedListing(req, m[1], res);
  if (!l) return;
  Object.assign(l, await readJsonBody(req));
  send(res, 200, l);
});
on('DELETE', /^\/v1\/listings\/([^/]+)$/, (req, res, m) => {
  const l = findOwnedListing(req, m[1], res);
  if (!l) return;
  l.status = 'removed';
  send(res, 200, l);
});
for (const [suffix, apply] of [
  ['sold', (l) => (l.status = 'sold')],
  ['reactivate', (l) => (l.status = 'active')],
  ['renew', (l) => { l.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); l.status = 'active'; }],
]) {
  on('POST', new RegExp(`^/v1/listings/([^/]+)/${suffix}$`), (req, res, m) => {
    const l = findOwnedListing(req, m[1], res);
    if (!l) return;
    apply(l);
    send(res, 200, l);
  });
}
on('POST', /^\/v1\/listings\/([^/]+)\/photos$/, async (req, res, m) => {
  const body = await readJsonBody(req);
  const l = findOwnedListing(req, m[1], res);
  if (!l) return;
  const bytes = body.__multipartBytes ?? 0;
  if (bytes === 0) {
    // ده بالظبط الباج اللي المرحلة ٥ لقطته: نداء بدون بايتات صورة فعلية
    return send(res, 400, errorBody('VALIDATION_ERROR', 'مفيش صورة مرفقة في الطلب (multipart فاضي)'));
  }
  const wasDraft = l.status === 'draft';
  l.photosCount += 1;
  if (wasDraft) { l.status = 'active'; l.publishedAt = now(); l.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); }
  send(res, 200, { activated: wasDraft });
});

/* ── المحادثات ── */
on('GET', /^\/v1\/chats$/, (req, res) => send(res, 200, { items: chats }));
on('GET', /^\/v1\/chats\/([^/]+)\/messages$/, (req, res, m) => send(res, 200, { items: messagesByChat[m[1]] ?? [] }));
on('POST', /^\/v1\/chats\/([^/]+)\/messages$/, async (req, res, m) => {
  const body = await readJsonBody(req);
  const msg = { id: `m-${randomUUID().slice(0, 8)}`, threadId: m[1], from: 'exhibition', body: String(body.body ?? ''), at: now() };
  (messagesByChat[m[1]] ??= []).push(msg);
  send(res, 200, msg);
});
on('POST', /^\/v1\/chats\/([^/]+)\/read$/, (req, res, m) => {
  const c = chats.find((x) => x.id === m[1]);
  if (c) c.unread = 0;
  send(res, 200, c ?? {});
});

/* ── المزادات (بوابة المعارض) ── */
on('GET', /^\/v1\/auctions\/mine\b/, (req, res) => send(res, 200, { items: bidsByAuction['a-1'] ?? [] }));
on('GET', /^\/v1\/auctions$/, (req, res) => send(res, 200, { items: auctions }));
on('GET', /^\/v1\/auctions\/([^/]+)\/bids$/, (req, res, m) => send(res, 200, bidsByAuction[m[1]] ?? []));
on('GET', /^\/v1\/auctions\/([^/]+)$/, (req, res, m) => {
  const a = auctions.find((x) => x.id === m[1]);
  if (!a) return send(res, 404, errorBody('NOT_FOUND', 'المزاد مش موجود'));
  send(res, 200, a);
});
on('POST', /^\/v1\/auctions\/([^/]+)\/bids$/, async (req, res, m) => {
  const body = await readJsonBody(req);
  const a = auctions.find((x) => x.id === m[1]);
  if (!a) return send(res, 404, errorBody('NOT_FOUND', 'المزاد مش موجود'));
  const bid = { id: `b-${randomUUID().slice(0, 8)}`, auctionId: a.id, bidderId: EXHIBITION.id, exhibitionName: EXHIBITION.name, amount: Number(body.amount ?? 0), createdAt: now() };
  (bidsByAuction[a.id] ??= []).push(bid);
  a.currentBid = bid.amount;
  a.nextBid = bid.amount + a.bidStep;
  a.bidsCount += 1;
  a.topBid = { exhibitionName: bid.exhibitionName, amount: bid.amount };

  // تمديد ضد القنص: آخر ٦٠ ثانية بتمدّ ٦٠ ثانية، بحد أقصى ٢٠ مرة (A-5، §4.5)
  const remaining = +new Date(a.endsAt) - Date.now();
  if (remaining < 60_000 && a.extensionCount < 20) {
    a.endsAt = new Date(Date.now() + 60_000).toISOString();
    a.extensionCount += 1;
    broadcast(`auction:${a.id}`, 'auction.extended', { auctionId: a.id, endsAt: a.endsAt });
  }

  // `bidCount` من غير `s` — نفس تسمية §4.5 بالحرف، مش `bidsCount` بتاعة عقد الـREST
  broadcast(`auction:${a.id}`, 'bid.placed', {
    auctionId: a.id, bidId: bid.id, exhibitionName: bid.exhibitionName,
    amount: bid.amount, bidCount: a.bidsCount, endsAt: a.endsAt, createdAt: bid.createdAt,
  });

  send(res, 200, { auction: a, bid });
});
on('POST', /^\/v1\/auctions\/([^/]+)\/entry$/, (req, res, m) => {
  const entry = { id: `ae-${randomUUID().slice(0, 8)}`, auctionId: m[1], auctionListingTitle: 'إعلان', exhibitionId: EXHIBITION.id, exhibitionName: EXHIBITION.name, fee: 500, paidAt: null, createdAt: now() };
  entries.push(entry);
  send(res, 200, entry);
});

/* ── الأدمن ── */
on('GET', /^\/v1\/admin\/health$/, (req, res) =>
  send(res, 200, { workerAlive: true, queuedScans: 0, oldestQueuedScanSeconds: 0, failedScans24h: 0, overdueAuctions: 0 }),
);
on('GET', /^\/v1\/admin\/stats\/overview$/, (req, res) =>
  send(res, 200, {
    listings: { draft: 1, active: 1, reserved: 0, sold: 0, expired: 0, removed: 0, rejected: 0 },
    users: { total: 2, new: 0, individual: 0, exhibition: 1, admin: 1 },
    sellNow: { pending: 1, offered: 0, accepted: 0, collected: 0 },
    auctions: { live: 1, settled: 0, failed: 0, overdue: 0 },
    financing: { submitted: 0, contacted: 0, approved: 0, rejected: 0 },
    trust: { kmVerifiedPct: 50, inspectedPct: 50, withPhotosPct: 50, pricedPct: 50 },
  }),
);
on('GET', /^\/v1\/admin\/listings$/, (req, res) => send(res, 200, page(listings)));
on('GET', /^\/v1\/admin\/users$/, (req, res) => send(res, 200, page([ADMIN_USER, EXH_USER])));
on('GET', /^\/v1\/admin\/exhibitions$/, (req, res) => send(res, 200, page([EXHIBITION])));
on('GET', /^\/v1\/admin\/sell-now\/requests$/, (req, res) => send(res, 200, page(sellNowRequests)));
on('GET', /^\/v1\/admin\/audit$/, (req, res) => send(res, 200, page(auditEntries)));

/* ═══════════════════════ السيرفر ═══════════════════════ */

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Idempotency-Key, X-Request-Id',
    );
    // بنسجّل الـrequest id ونرجّعه في الرد — بيسهّل ربط شكوى معرض بسطر
    // اللوج بتاعه، وبيتأكد إن الفرونت بيقرا هوية السيرفر لو رجّعها (client.ts)
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    const reqId = req.headers['x-request-id'];
    if (reqId) res.setHeader('X-Request-Id', reqId);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));

  console.log(`[mock-backend] ${req.method} ${url.pathname}${match ? '' : ' — 501 (غير متغطّى)'}`);

  if (!match) {
    return send(res, 501, errorBody('NOT_FOUND', `مفيش نموذج لـ${req.method} ${url.pathname} في سيرفر الاختبار — سجّله في docs/BACKEND-CONTRACT.md`));
  }

  const params = url.pathname.match(match.pattern);
  try {
    await match.handler(req, res, params);
  } catch (e) {
    console.error(e);
    send(res, 500, errorBody('CONFLICT', 'خطأ داخلي في سيرفر الاختبار'));
  }
});

/* ═══════════════════════ WebSocket — `/v1/ws` (المرحلة ٦، PORTAL §4.5 / ADMIN §9) ═══════════════════════
 * نفس البروتوكول الموصوف في `PORTAL §4.5` بالحرف — دي أول تجربة حقيقية
 * له فعليًا (مش قراءة كود بس)، ومصدر الحقيقة لاختبار `useRealtime()`
 * وللاختبار المتقاطع بين سياقين (`e2e/realtime.spec.ts`).
 */
// eventLog: topic → آخر ٢٠٠ حدث (لـ`since`/R-3)، topicSockets: topic → مشتركين حاليين
const eventLog = new Map();
const topicSockets = new Map();
let eventSeq = 0;

function wsSend(ws, frame) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
}

function broadcast(topic, type, data) {
  eventSeq += 1;
  const frame = { type, topic, event_id: String(eventSeq), data };
  const log = eventLog.get(topic) ?? [];
  log.push(frame);
  if (log.length > 200) log.shift();
  eventLog.set(topic, log);
  for (const ws of topicSockets.get(topic) ?? []) wsSend(ws, frame);
}

const wss = new WebSocketServer({ server, path: '/v1/ws' });

wss.on('connection', (ws) => {
  let authed = false;
  const subscribedTopics = new Set();

  // §4.5 بند ١: `auth` خلال أول ١٠ ثواني وإلا السوكت بيتقفل
  const authTimer = setTimeout(() => {
    if (!authed) ws.close(4001, 'AUTH_TIMEOUT');
  }, 10_000);

  ws.on('message', (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (frame.type === 'auth') {
      // بيشتغل برضه لو السوكت already authed — تجديد التوكن على سوكت شغّال (R-4)
      if (!accessTokens.get(frame.token)) return ws.close(4003, 'INVALID_TOKEN');
      authed = true;
      clearTimeout(authTimer);
      wsSend(ws, { type: 'auth.ok', data: { topics: [`user:${accessTokens.get(frame.token)}`] } });
      return;
    }

    if (!authed) return; // أي حاجة قبل auth بتتجاهل بصمت

    if (frame.type === 'subscribe' && typeof frame.topic === 'string') {
      subscribedTopics.add(frame.topic);
      if (!topicSockets.has(frame.topic)) topicSockets.set(frame.topic, new Set());
      topicSockets.get(frame.topic).add(ws);
      wsSend(ws, { type: 'subscribed', topic: frame.topic });
      // استرجاع اللي فاتك (R-3)
      const since = frame.since ? Number(frame.since) : 0;
      for (const evt of eventLog.get(frame.topic) ?? []) {
        if (Number(evt.event_id) > since) wsSend(ws, evt);
      }
      return;
    }

    if (frame.type === 'ping') wsSend(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    for (const topic of subscribedTopics) topicSockets.get(topic)?.delete(ws);
  });
});

// ووركر بسيط بيقفل أي مزاد `live` عدّى ميعاده كل ٥ ثواني ويبعت `auction.ended`
// (A-8) — **الشاشة ممنوع تقفل المزاد بنفسها**، دي بالظبط مسؤولية الووركر.
setInterval(() => {
  const dueNow = Date.now();
  for (const a of auctions) {
    if (a.status !== 'live' || +new Date(a.endsAt) > dueNow) continue;
    const bids = bidsByAuction[a.id] ?? [];
    a.status = a.bidsCount > 0 ? 'settled' : 'failed';
    a.winnerBidId = bids.length ? bids[bids.length - 1].id : null;
    broadcast(`auction:${a.id}`, 'auction.ended', { auctionId: a.id, status: a.status });
  }
}, 5_000);

server.listen(PORT, () => {
  console.log(`[mock-backend] شغال على http://localhost:${PORT}`);
  console.log(`[mock-backend] WebSocket على ws://localhost:${PORT}/v1/ws`);
  console.log('[mock-backend] دخول تجريبي: أي كود ٦ أرقام + 01001234567 (معرض) أو 01000000000 (أدمن)');
});
