'use client';

/**
 * ════════════════════════════════════════════════════════════════
 * طبقة الريل تايم — `useRealtime(topic, onEvent)` (المرحلة ٦)
 *
 * نقطة تبديل واحدة زي `USE_MOCK` بالظبط: الشاشة بتنادي `useRealtime()`
 * ومتعرفش هي شغالة على WebSocket حقيقي (`{API_URL}/v1/ws`) ولا على
 * ناقل موك في الذاكرة — القرار بياخده `USE_MOCK` هنا مرة واحدة بس.
 *
 * البروتوكول (`PORTAL §4.5` بالحرف — **متصممش واحد من عندك**):
 *   الإطارات: `{ type, topic, event_id, data }`
 *   ١) `{type:'auth', token}` خلال أول ١٠ ثواني وإلا السوكت بيتقفل → `auth.ok`
 *   ٢) `{type:'subscribe', topic, since:lastEventId}` → `subscribed` ثم
 *      الأحداث الفايتة (R-3 — استرجاع اللي فاتك)
 *   ٣) `{type:'ping'}` → `pong` كل ٢٠ ثانية (إبقاء الاتصال)
 *   ٤) `{type:'auth', token:newToken}` على سوكت شغّال لما التوكن يتجدّد (R-4)
 *
 * **قاعدة إلزامية من §4.5 بند ٢: مفيش إعادة اتصال تلقائي.** لو السوكت
 * اتقفل، الحالة بترجع `'disconnected'` وتفضل كده — مفيش exponential
 * backoff ولا أي محاولة اتصال تانية من غير ما المستخدم يعمل حاجة
 * (تحديث الصفحة، أو `reconnect()` اللي الشاشة بتنادّيها بنفسها بعد
 * ضغطة زرار صريحة). الشاشة هي اللي بتعرض بانر «الاتصال اتقطع — تحديث»
 * وتسحب REST تاني — دي مش مسؤولية الطبقة دي (`docs/REALTIME.md`).
 *
 * المواضيع الموجودة فعليًا في الباك (`R-1`): `chat:{thread_id}` ·
 * `auction:{auction_id}` · `user:{user_id}`. مفيش موضوع `admin:*` —
 * **لوحة الأدمن بتفضل polling بالكامل**، الملف ده مش بيتنادى منها
 * (`ADMIN §9`: «متحوّلش لوحة الأدمن لـWS»).
 * ════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useState } from 'react';
import { API_URL, USE_MOCK, WS_URL, tokenStore } from './client';

/** شكل أي إطار جاي من السوكت — البروتوكول الموصوف في §4.5 بالحرف */
export interface RealtimeFrame<TData = unknown> {
  type: string;
  topic?: string;
  event_id?: string;
  data?: TData;
}

/** `bid.placed` — الحمولة موصوفة بالحرف في §4.5 (`bidCount` من غير `s`، عكس `Auction.bidsCount`) */
export interface BidPlacedData {
  auctionId: string;
  bidId: string;
  exhibitionName: string;
  amount: number;
  bidCount: number;
  endsAt: string;
  createdAt: string;
}

/** `auction.extended` — تمديد ضد القنص (A-5)، ٦٠ ثانية بحد أقصى ٢٠ مرة */
export interface AuctionExtendedData {
  auctionId: string;
  endsAt: string;
}

/** `auction.ended` — الووركر هو اللي بيقفل المزاد (A-8)، مش الشاشة */
export interface AuctionEndedData {
  auctionId: string;
  status: string;
}

export type RealtimeStatus = 'connecting' | 'open' | 'disconnected';

type Handler = (frame: RealtimeFrame) => void;

/* ════════════════════════ الناقل الحقيقي: WebSocket ════════════════════════ */

/**
 * اتصال واحد مشترك لكل تطبيق (singleton) — مش سوكت لكل مكوّن مشترك في
 * موضوع. أول اشتراك بيفتح السوكت، وكل موضوع بعده بيشارك نفس الاتصال.
 */
class RealtimeConnection {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = 'disconnected';
  private authed = false;
  private authTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly topicHandlers = new Map<string, Set<Handler>>();
  private readonly lastEventId = new Map<string, string>();
  private readonly statusListeners = new Set<(s: RealtimeStatus) => void>();
  private unsubscribeTokenChange: (() => void) | null = null;

  private setStatus(next: RealtimeStatus) {
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  onStatusChange(listener: (s: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** بيتنادى مرة واحدة بس من أول `subscribe()` — مفيش سوكت من غير مشترك */
  private ensureConnected() {
    if (this.ws || !API_URL) return;
    const token = tokenStore.get();
    if (!token) return; // هنحاول تاني أول ما فيه توكن (subscribe بيعيد المحاولة)

    this.setStatus('connecting');
    const ws = new WebSocket(`${WS_URL}/v1/ws`);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.send({ type: 'auth', token: tokenStore.get() });
      // §4.5 بند ١: لازم auth.ok خلال ١٠ ثواني وإلا نعتبره فشل
      this.authTimer = setTimeout(() => {
        if (!this.authed) ws.close();
      }, 10_000);
    });

    ws.addEventListener('message', (ev) => this.handleMessage(String(ev.data)));

    ws.addEventListener('close', () => this.teardown());
    ws.addEventListener('error', () => ws.close());

    // لو التوكن اتجدّد وإحنا متصلين، جدّد الـauth على نفس السوكت (R-4) —
    // من غيره السوكت هيتقفل لوحده لما التوكن القديم ينتهي فعليًا في الباك.
    this.unsubscribeTokenChange = tokenStore.onChange((newToken) => {
      if (newToken && this.ws === ws && ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'auth', token: newToken });
      }
    });
  }

  private teardown() {
    if (this.authTimer) clearTimeout(this.authTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.unsubscribeTokenChange?.();
    this.authTimer = null;
    this.pingTimer = null;
    this.unsubscribeTokenChange = null;
    this.authed = false;
    this.ws = null;
    // §4.5 بند ٢: مفيش إعادة اتصال تلقائي — الحالة بتفضل disconnected
    // لحد ما مكوّن جديد يعمل subscribe (زي فتح الشاشة تاني/تحديث الصفحة)
    this.setStatus('disconnected');
  }

  private send(frame: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private handleMessage(raw: string) {
    let frame: RealtimeFrame;
    try {
      frame = JSON.parse(raw) as RealtimeFrame;
    } catch {
      return;
    }

    if (frame.type === 'auth.ok') {
      this.authed = true;
      if (this.authTimer) clearTimeout(this.authTimer);
      this.setStatus('open');
      // كل موضوع مطلوب من قبل ما السوكت يخلص auth — اشترك فيه دلوقتي
      for (const topic of this.topicHandlers.keys()) this.sendSubscribe(topic);
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 20_000);
      return;
    }

    if (frame.type === 'subscribed' || frame.type === 'pong') return;

    // أي حدث تاني: سجّل event_id لل`since` القادم (R-3)، وابعته لمشتركي الموضوع
    if (frame.topic && frame.event_id) this.lastEventId.set(frame.topic, frame.event_id);
    const handlers = frame.topic ? this.topicHandlers.get(frame.topic) : undefined;
    if (handlers) for (const handler of handlers) handler(frame);
  }

  private sendSubscribe(topic: string) {
    this.send({ type: 'subscribe', topic, since: this.lastEventId.get(topic) ?? null });
  }

  subscribe(topic: string, handler: Handler): () => void {
    let set = this.topicHandlers.get(topic);
    if (!set) {
      set = new Set();
      this.topicHandlers.set(topic, set);
    }
    const isFirst = set.size === 0;
    set.add(handler);

    this.ensureConnected();
    if (isFirst && this.authed) this.sendSubscribe(topic);

    return () => {
      set?.delete(handler);
      // مفيش إطار unsubscribe موصوف في البروتوكول — بنوقف التوزيع محليًا
      // بس، والسوكت المشترك بيفضل مفتوح لمواضيع تانية لسه مشترَكة فيها.
    };
  }
}

const wsConnection = typeof window !== 'undefined' && !USE_MOCK ? new RealtimeConnection() : null;

/* ════════════════════════ الناقل الموك: ناقل في الذاكرة ════════════════════════ */

/**
 * وضع الموك مالوش شبكة خالص (`packages/api-client/src/mock/db.ts` كله
 * في الذاكرة) — فالـ"سوكت الموك" هنا حرفيًا event bus محلي في نفس الـtab.
 * `mock/db.ts` بينادي `emitMockRealtimeEvent()` لما `placeBid()`/التمديد/
 * القفل يحصلوا، وأي `useRealtime()` مشترك في نفس الموضوع بياخد الحدث
 * فورًا — نفس شكل الواجهة بالظبط اللي الناقل الحقيقي بيديه.
 */
class MockRealtimeBus {
  private readonly topicHandlers = new Map<string, Set<Handler>>();
  private seq = 0;

  emit(topic: string, type: string, data: unknown) {
    this.seq += 1;
    const frame: RealtimeFrame = { type, topic, event_id: String(this.seq), data };
    const handlers = this.topicHandlers.get(topic);
    if (handlers) for (const handler of handlers) handler(frame);
  }

  subscribe(topic: string, handler: Handler): () => void {
    let set = this.topicHandlers.get(topic);
    if (!set) {
      set = new Set();
      this.topicHandlers.set(topic, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }
}

export const mockRealtimeBus = new MockRealtimeBus();

/** بينادها `mock/db.ts` بس — شاشات المشروع بتستخدم `useRealtime()` مش الحدث الخام */
export function emitMockRealtimeEvent(topic: string, type: string, data: unknown) {
  mockRealtimeBus.emit(topic, type, data);
}

/* ════════════════════════ الـhook العام ════════════════════════ */

/**
 * `useRealtime(topic, onEvent)` — اشترك في موضوع، واستقبل كل الأحداث
 * الجاية عليه. `topic` بـ`null` معناها "لسه مالناش موضوع" (مثلًا
 * `auctionId` لسه مش محمّل) — مفيش اشتراك يحصل خالص.
 *
 * **REST الأول، WS بعدين (§4.5 بند ١):** الـhook ده منقلش بيانات ابتدائية
 * — الشاشة بتقرا REST بـ`useQuery` عادي زي ما هي، والحدث الحي بيوصل
 * لـ`onEvent` عشان الشاشة تحدّث الكاش بنفسها (`qc.setQueryData`).
 *
 * الحالة المرجعة (`status`) بتتحرك `connecting → open → disconnected`
 * ومفيش رجوع لـ`open` تاني من غير remount/تحديث صفحة (مفيش إعادة اتصال
 * تلقائي — §4.5 بند ٢). في وضع الموك، الحالة دايمًا `'open'` فورًا —
 * الناقل محلي، مفيش اتصال شبكة يتقطع أصلًا.
 */
export function useRealtime(topic: string | null, onEvent: Handler): { status: RealtimeStatus } {
  const [status, setStatus] = useState<RealtimeStatus>(
    USE_MOCK ? 'open' : (wsConnection?.getStatus() ?? 'disconnected'),
  );
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!topic) return;

    if (USE_MOCK) {
      setStatus('open');
      return mockRealtimeBus.subscribe(topic, (frame) => handlerRef.current(frame));
    }

    if (!wsConnection) return;
    setStatus(wsConnection.getStatus());
    const unsubscribeStatus = wsConnection.onStatusChange(setStatus);
    const unsubscribeTopic = wsConnection.subscribe(topic, (frame) => handlerRef.current(frame));
    return () => {
      unsubscribeStatus();
      unsubscribeTopic();
    };
  }, [topic]);

  return { status };
}
