import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

/**
 * ════════════════════════════════════════════════════════════════
 * اختبارات بروتوكول الـWebSocket — `PORTAL §4.5` بالحرف (المرحلة ٦،
 * مخرج رسمي `MISSION.md §6`)
 *
 * زي `contract.test.ts` بالظبط: سيرفر موك حقيقي (`mock-backend.mjs`)
 * كـchild process، بس هنا بنتصل بـ`/v1/ws` فعليًا بعميل WS حقيقي (نفس
 * حزمة `ws` اللي السيرفر نفسه بيستخدمها) — مش قراءة كود `realtime.ts`
 * وتصديقه. بورت مستقل (٤٣٢٥) عن `contract.test.ts` (٤٣٢١) عشان
 * الملفين يشتغلوا بالتوازي من غير تصادم.
 *
 * ده بيغطّي طبقة الناقل (البروتوكول + البرودكاست) بشكل آلي وسريع.
 * الاتساق البصري الكامل عبر التطبيقين (سياقين متصفح حقيقيين) موثّق
 * بدليل حي في `reports/PHASE-6-REALTIME.md §٨` — راجع الملف ده كمان
 * لأسباب القرار (اختبار Playwright منفصل ثقيل، مش جزء من `npm run e2e`
 * الافتراضي عشان مايرجعش بطء المرحلة ٥ اللي اتصلّح جذريًا).
 * ════════════════════════════════════════════════════════════════
 */

const PORT = 4325;
const BASE = `http://localhost:${PORT}`;
const WS_BASE = `ws://localhost:${PORT}/v1/ws`;
const SCRIPT = fileURLToPath(new URL('../../../../scripts/mock-backend.mjs', import.meta.url));

let proc: ChildProcess;

async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/v1/catalog/makes`);
      if (res.ok) return;
    } catch {
      /* لسه مابدأش يسمع */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`mock-backend.mjs ما بدأش يسمع على ${BASE} خلال ${timeoutMs}ms`);
}

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

/** بيستنى إطار من نوع معيّن ويرجّعه — بيتجاهل أي إطار تاني قبله */
function waitForFrame<T = unknown>(
  ws: WebSocket,
  type: string,
  timeoutMs = 5_000,
): Promise<{ type: string; topic?: string; event_id?: string; data?: T }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ماوصلش إطار ${type} خلال ${timeoutMs}ms`)), timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const frame = JSON.parse(raw.toString());
      if (frame.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(frame);
      }
    };
    ws.on('message', onMessage);
  });
}

beforeAll(async () => {
  proc = spawn('node', [SCRIPT], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await waitForServer();
}, 20_000);

afterAll(() => {
  proc?.kill();
});

describe('WebSocket — الاتصال والمصادقة (§4.5 بند ١)', () => {
  it('بيرفض أي حاجة قبل auth، وبيرد auth.ok بعد توكن صحيح', async () => {
    const token = await loginAs('exhibition');
    const ws = new WebSocket(WS_BASE);
    await new Promise((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ type: 'auth', token }));
    const frame = await waitForFrame<{ topics: string[] }>(ws, 'auth.ok');
    expect(frame.data?.topics).toContain('user:u-exh-1');
    ws.close();
  });

  it('توكن غلط — السوكت بيتقفل', async () => {
    const ws = new WebSocket(WS_BASE);
    await new Promise((resolve) => ws.once('open', resolve));
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send(JSON.stringify({ type: 'auth', token: 'مش-موجود' }));
    const code = await closed;
    expect(code).toBe(4003);
  });
});

describe('WebSocket — الاشتراك والبرودكاست (§4.5 بند ٢-٤)', () => {
  async function authedSocket(role: 'admin' | 'exhibition' = 'exhibition') {
    const token = await loginAs(role);
    const ws = new WebSocket(WS_BASE);
    await new Promise((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ type: 'auth', token }));
    await waitForFrame(ws, 'auth.ok');
    return ws;
  }

  it('subscribe بيرد subscribed، و`ping` بيرد `pong`', async () => {
    const ws = await authedSocket();
    ws.send(JSON.stringify({ type: 'subscribe', topic: 'auction:a-1', since: null }));
    const subscribed = await waitForFrame(ws, 'subscribed');
    expect(subscribed.topic).toBe('auction:a-1');

    ws.send(JSON.stringify({ type: 'ping' }));
    await waitForFrame(ws, 'pong');
    ws.close();
  });

  it('مزايدة عبر REST بتوصل كـ`bid.placed` لأي سوكت مشترك في نفس المزاد — بسياقين مختلفين (§6 بند ٧)', async () => {
    // "سياقين" هنا حرفيًا: اتصالين WS منفصلين تمامًا، زي تابين مختلفين —
    // واحد بيراقب بس (زي تاب الأدمن)، والتاني (REST) هو اللي بيزايد فعليًا.
    const watcher = await authedSocket('admin');
    watcher.send(JSON.stringify({ type: 'subscribe', topic: 'auction:a-1', since: null }));
    await waitForFrame(watcher, 'subscribed');

    const bidderToken = await loginAs('exhibition');
    const bidPromise = waitForFrame<{ auctionId: string; amount: number; bidCount: number }>(
      watcher,
      'bid.placed',
    );
    const res = await fetch(`${BASE}/v1/auctions/a-1/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bidderToken}` },
      body: JSON.stringify({ amount: 700_000 }),
    });
    expect(res.status).toBe(200);

    const evt = await bidPromise;
    expect(evt.data?.auctionId).toBe('a-1');
    expect(evt.data?.amount).toBe(700_000);
    expect(typeof evt.data?.bidCount).toBe('number');
    expect(evt.event_id).toBeTruthy();
    watcher.close();
  });

  it('استرجاع اللي فاتك (`since`, R-3) — اشتراك جديد بيجيب الأحداث الفايتة بس', async () => {
    // مزايدة الأول من غير حد مشترك — الحدث بيتسجّل في السجل بس محدش يستقبله لايف
    const firstBidderToken = await loginAs('exhibition');
    await fetch(`${BASE}/v1/auctions/a-1/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstBidderToken}` },
      body: JSON.stringify({ amount: 900_000 }),
    });

    // اشتراك بـsince=0 — المفروض يجيب كل تاريخ الموضوع من الاختبار اللي فات + ده
    const ws = await authedSocket('admin');
    ws.send(JSON.stringify({ type: 'subscribe', topic: 'auction:a-1', since: '0' }));
    await waitForFrame(ws, 'subscribed');
    const replayed = await waitForFrame<{ amount: number }>(ws, 'bid.placed');
    expect(replayed.data?.amount).toBeGreaterThan(0);
    ws.close();
  });
});
