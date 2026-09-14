import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * ════════════════════════════════════════════════════════════════
 * اختبارات عقود — بتشتغل على سيرفر الموك الحقيقي (المرحلة ٥، مخرج
 * رسمي مطلوب في `MISSION.md §5` آخر سطر)
 *
 * الفرق عن باقي اختبارات الوحدة: دول بيبعتوا نداءات HTTP حقيقية
 * (`fetch`) لـ`scripts/mock-backend.mjs` شغّال كـchild process فعلي —
 * مش بيحاكوا الموك جوه نفس العملية. الهدف: تثبيت شكل الردود (العقد)
 * اللي `docs/BACKEND-CONTRACT.md` بيوثّقه، عشان أي تغيير مستقبلي في
 * `mock-backend.mjs` (أو في التوقعات) يتلقط آليًا بدل ما يتكشف يدوي
 * زي ما حصل في المراجعة الحية (`reports/PHASE-5-BACKEND-READINESS.md §٨`).
 *
 * بورت مخصص (٤٣٢١) مختلف عن الافتراضي (٤٠٠٠) عشان ميتصادمش مع تشغيل
 * يدوي لنفس السكريبت وقت التطوير.
 * ════════════════════════════════════════════════════════════════
 */

const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const SCRIPT = fileURLToPath(new URL('../../../../scripts/mock-backend.mjs', import.meta.url));

let proc: ChildProcess;

async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/v1/catalog/makes`);
      if (res.ok) return;
    } catch {
      /* لسه مابدأش يسمع — نجرّب تاني */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`mock-backend.mjs ما بدأش يسمع على ${BASE} خلال ${timeoutMs}ms`);
}

/** بيدخل بدور معيّن وبيرجّع access token صالح لنداءات محمية */
async function loginAs(role: 'admin' | 'exhibition'): Promise<string> {
  const phone = role === 'admin' ? '01000000000' : '01001234567';
  const res = await fetch(`${BASE}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

beforeAll(async () => {
  proc = spawn('node', [SCRIPT], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await waitForServer();
}, 20_000);

afterAll(() => {
  proc?.kill();
});

describe('الأوثنتيكيشن (docs/AUTH.md + docs/BACKEND-CONTRACT.md §١)', () => {
  it('POST /v1/auth/otp/request بيرجّع 204', async () => {
    const res = await fetch(`${BASE}/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01001234567' }),
    });
    expect(res.status).toBe(204);
  });

  it('POST /v1/auth/otp/verify بيرجّع access_token/refresh_token/user بالشكل الصح', async () => {
    const res = await fetch(`${BASE}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01000000000', code: '123456' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: { id: expect.any(String), name: expect.any(String), phone: expect.any(String), role: 'admin' },
    });
  });

  it('كود ناقص ⇒ عقد الأخطاء X-4 الصحيح (error.code/message/fields)', async () => {
    const res = await fetch(`${BASE}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01000000000', code: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String), fields: null },
    });
  });

  it('GET /v1/me بلا Authorization ⇒ 401 NOT_AUTHENTICATED', async () => {
    const res = await fetch(`${BASE}/v1/me`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('GET /v1/me بتوكن صالح بيرجّع المستخدم المتوقّع', async () => {
    const token = await loginAs('exhibition');
    const res = await fetch(`${BASE}/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('exhibition');
  });

  it('POST /v1/auth/refresh بمفتاح صالح بيدوّره ويرجّع access جديد (I-4)', async () => {
    const verify = await fetch(`${BASE}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01001234567', code: '123456' }),
    });
    const { refresh_token: firstRefresh } = (await verify.json()) as { refresh_token: string };

    const refreshed = await fetch(`${BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: firstRefresh }),
    });
    expect(refreshed.status).toBe(200);
    const body = await refreshed.json();
    expect(body).toMatchObject({
      access_token: expect.any(String),
      expires_in: expect.any(Number),
      refresh_token: expect.any(String),
    });
    // بيتدوّر — مفتاح جديد مختلف عن الأصلي (I-4)
    expect(body.refresh_token).not.toBe(firstRefresh);

    // والمفتاح القديم بقى ملغي — استخدام تاني ليه لازم يرفض
    const reused = await fetch(`${BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: firstRefresh }),
    });
    expect(reused.status).toBe(401);
  });
});

describe('الكتالوج (docs/EXHIBITION_PORTAL_SPEC.md §8.1)', () => {
  it('GET /v1/catalog/makes بشكل {items: [{name, models[]}]}', async () => {
    const res = await fetch(`${BASE}/v1/catalog/makes`);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toMatchObject({ name: expect.any(String), models: expect.any(Array) });
  });

  it('GET /v1/catalog/governorates بشكل {items: [{name, areas[]}]}', async () => {
    const res = await fetch(`${BASE}/v1/catalog/governorates`);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({ name: expect.any(String), areas: expect.any(Array) });
  });
});

describe('الإعلانات والمعرض (PORTAL §8.1)', () => {
  it('GET /v1/exhibitions/me بيرجّع Exhibition كامل بالحقول المتوقّعة', async () => {
    const token = await loginAs('exhibition');
    const res = await fetch(`${BASE}/v1/exhibitions/me`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      isContracted: expect.any(Boolean),
      verified: expect.any(Boolean),
    });
  });

  it('GET /v1/me/listings بشكل {items: Listing[]}', async () => {
    const res = await fetch(`${BASE}/v1/me/listings`);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      price: expect.any(Number),
      status: expect.any(String),
      seller: { id: expect.any(String), name: expect.any(String) },
    });
  });

  it('POST /v1/listings بيولّد إعلان draft جديد', async () => {
    const res = await fetch(`${BASE}/v1/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ make: 'كيا', model: 'سيراتو', year: 2019, price: 400000 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('draft');
    expect(body.id).toEqual(expect.any(String));
  });

  it('GET /v1/listings/{id} — فحص ملكية إجباري (FND-052, P0)', async () => {
    const exhibitionToken = await loginAs('exhibition');
    const ownRes = await fetch(`${BASE}/v1/listings/l-1`, {
      headers: { Authorization: `Bearer ${exhibitionToken}` },
    });
    expect(ownRes.status).toBe(200);

    // توكن مستخدم تاني (أدمن) مش مالك الإعلان — لازم 403 صريح، مش بياناته
    const adminToken = await loginAs('admin');
    const foreignRes = await fetch(`${BASE}/v1/listings/l-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(foreignRes.status).toBe(403);
    const foreignBody = await foreignRes.json();
    expect(foreignBody.error.code).toBe('FORBIDDEN');

    // من غير توكن خالص
    const noAuthRes = await fetch(`${BASE}/v1/listings/l-1`);
    expect(noAuthRes.status).toBe(401);
  });
});

describe('المزادات (A-3: nextBid من السيرفر)', () => {
  it('GET /v1/auctions بشكل {items: Auction[]} وكل مزاد فيه nextBid/bidStep', async () => {
    const res = await fetch(`${BASE}/v1/auctions`);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: expect.any(String),
      nextBid: expect.any(Number),
      bidStep: expect.any(Number),
      status: expect.any(String),
    });
  });

  it('GET /v1/auctions/{id}/bids بيرجّع مصفوفة مزايدات', async () => {
    const res = await fetch(`${BASE}/v1/auctions/a-1/bids`);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: expect.any(String), amount: expect.any(Number) });
  });

  it('POST /v1/auctions/{id}/bids بيرجّع {auction, bid} ويحدّث currentBid/nextBid', async () => {
    const before = await (await fetch(`${BASE}/v1/auctions/a-1`)).json();
    const res = await fetch(`${BASE}/v1/auctions/a-1/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: before.nextBid }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auction.currentBid).toBe(before.nextBid);
    expect(body.bid).toMatchObject({ amount: before.nextBid, auctionId: 'a-1' });
  });

  it('مزاد مش موجود ⇒ 404 NOT_FOUND بعقد X-4', async () => {
    const res = await fetch(`${BASE}/v1/auctions/a-ghost`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('لوحة الأدمن (ADMIN §6.1/6.2)', () => {
  it('GET /v1/admin/stats/overview بشكل OverviewStats كامل', async () => {
    const res = await fetch(`${BASE}/v1/admin/stats/overview`);
    const body = await res.json();
    expect(body).toMatchObject({
      listings: expect.any(Object),
      users: expect.any(Object),
      sellNow: expect.any(Object),
      auctions: expect.any(Object),
      financing: expect.any(Object),
      trust: expect.any(Object),
    });
  });

  it('GET /v1/admin/listings بشكل Page<Listing> ({items, nextCursor, total})', async () => {
    const res = await fetch(`${BASE}/v1/admin/listings`);
    const body = await res.json();
    expect(body).toMatchObject({
      items: expect.any(Array),
      nextCursor: null,
      total: expect.any(Number),
    });
  });

  it('GET /v1/admin/health بشكل HealthSnapshot جزئي', async () => {
    const res = await fetch(`${BASE}/v1/admin/health`);
    const body = await res.json();
    expect(body).toMatchObject({
      workerAlive: expect.any(Boolean),
      overdueAuctions: expect.any(Number),
    });
  });
});

describe('endpoint غير مغطّى (توثيق سلوك مقصود — README §mock-backend)', () => {
  it('مسار مش موجود في السيرفر ⇒ 501 بعقد X-4 صحيح، مش HTML/كراش', async () => {
    const res = await fetch(`${BASE}/v1/admin/stats/timeseries?metric=listings_published`);
    expect(res.status).toBe(501);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
  });
});

describe('CORS (docs/BACKEND-CONTRACT.md §6.2 — لقطة حية FND-042)', () => {
  it('Access-Control-Allow-Headers لازم يشمل X-Request-Id', async () => {
    const res = await fetch(`${BASE}/v1/catalog/makes`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3100' },
    });
    const allowed = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowed.toLowerCase()).toContain('x-request-id');
    expect(allowed.toLowerCase()).toContain('idempotency-key');
  });
});
