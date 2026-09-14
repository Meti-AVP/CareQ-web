'use client';

/**
 * ════════════════════════════════════════════════════════════════
 * hooks بوابة المعارض
 *
 * القاعدة الحاكمة (A-0): **السيرفر هو اللي بيقرر، والواجهة بتعرض بس.**
 *  · ولا مكان واحد بيحسب مبلغ مزايدة — `nextBid` من السيرفر دايمًا
 *  · ولا عداد واحد بينقص محليًا — كلهم من `endsAt`
 *  · حالة المزاد `staleTime: 0` — ممنوع كاش خالص (§10.7)
 * ════════════════════════════════════════════════════════════════
 */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as mock from '../mock/db';
import { http, USE_MOCK, IdempotencyKeyCache, visibleRefetchInterval } from '../client';
import { useRealtime } from '../realtime';
import type {
  ApplicationStatus,
  Auction,
  AuctionBid,
  AuctionEntry,
  Catalog,
  ChatMessage,
  ChatThread,
  Exhibition,
  ExhibitionApplication,
  ExhibitionStats,
  Listing,
} from '../types';

async function m<T>(fn: () => T, ms = 120): Promise<T> {
  await mock.latency(ms);
  return fn();
}

/** نسخة واحدة من `IdempotencyKeyCache` تفضل ثابتة عبر إعادة الرندر (X-3) */
function useStableIdempotencyKey(prefix: string): IdempotencyKeyCache {
  return useRef(new IdempotencyKeyCache(prefix)).current;
}

/* ═══════════════════════ المعرض الحالي ═══════════════════════ */

export function useMyExhibition() {
  return useQuery<Exhibition>({
    queryKey: ['dealer', 'me', 'exhibition'],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getDemoExhibition()) : http<Exhibition>('/v1/exhibitions/me'),
    refetchOnWindowFocus: true,
    /**
     * `isContracted`/`verified` قرار أدمن بيتغيّر من شاشة تانية بالكامل
     * (`/exhibitions/[id]`) — مفيش موضوع WS ليه (`docs/REALTIME.md`،
     * `MISSION §6` بند ٥: «مش واضح ليه موضوع» صراحة). بولينج خفيف بدل
     * الانتظار لحد `refetchOnWindowFocus` — نفس القيمة المستخدمة في
     * `useExhibitionStats` المشابهة لها.
     */
    refetchInterval: visibleRefetchInterval(60_000),
  });
}

/**
 * تعديل ملف المعرض العام.
 * **مطلوب في الباك:** `PATCH /v1/exhibitions/me` (§8.2) — `PATCH /v1/me`
 * بياخد `name` و`area` بس ومش كفاية لحقول المعرض.
 *
 * لاحظ إن `verified` و`isContracted` **مش في العقد ده عن قصد**: دول
 * قرار أدمن، والواجهة بتعرضهم بس (§4.7).
 */
export type ExhibitionProfilePatch = Partial<
  Pick<
    Exhibition,
    'name' | 'governorate' | 'area' | 'financingNote' | 'inspectionService' | 'logoUrl' | 'coverUrl'
  >
>;

export function useUpdateMyExhibition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ExhibitionProfilePatch) =>
      USE_MOCK
        ? m(() => {
            const row = mock.mockDb.exhibitions.find((e) => e.id === mock.DEMO_EXHIBITION_ID);
            if (!row) throw new Error('المعرض مش موجود');
            Object.assign(row, patch);
            return { ...row };
          }, 600)
        : http<Exhibition>('/v1/exhibitions/me', { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'me', 'exhibition'] }),
  });
}

export function useExhibitionStats() {
  return useQuery<ExhibitionStats>({
    queryKey: ['dealer', 'stats'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getExhibitionStats())
        : http<ExhibitionStats>('/v1/me/exhibition/stats'),
    refetchInterval: visibleRefetchInterval(300_000),
  });
}

/* ═══════════════════════ المخزون ═══════════════════════ */

export function useMyListings() {
  return useQuery<Listing[]>({
    queryKey: ['dealer', 'listings'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getMyListings())
        : http<{ items: Listing[] }>('/v1/me/listings').then((r) => r.items),
    refetchOnWindowFocus: true,
  });
}

/**
 * إعلان واحد لفورم التعديل. `getOwnedListing` (مش `getListing` الخام)
 * — فحص ملكية إجباري (`FND-052`, P0): إعلان معرض تاني برجع `FORBIDDEN`
 * مش بياناته كاملة. تفاصيل `docs/BACKEND-CONTRACT.md §6.0`.
 */
export function useMyListing(id: string) {
  return useQuery<Listing>({
    queryKey: ['dealer', 'listings', id],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID))
        : http<Listing>(`/v1/listings/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * إنشاء إعلان. **بيتولد `draft`** والصورة الأولى هي اللي بتفعّله (D-2) —
 * فالواجهة لازم تقول ده صراحة بدل ما البائع يفتكر إنه نشر.
 */
export function useCreateListing() {
  const qc = useQueryClient();
  // كل استمارة إنشاء عندها عملية منطقية واحدة معلّقة في نفس اللحظة
  const keys = useStableIdempotencyKey('listing');
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      USE_MOCK
        ? m(() => ({ id: `l-new-${Date.now()}`, ...payload }) as unknown as Listing, 700)
        : http<Listing>('/v1/listings', {
            method: 'POST',
            body: payload,
            // إجباري: من غيره إعادة المحاولة بتنشر العربية مرتين (X-3)
            idempotency: keys.get('pending'),
          }),
    onSuccess: () => {
      keys.clear('pending');
      qc.invalidateQueries({ queryKey: ['dealer', 'listings'] });
    },
  });
}

/**
 * رفع بالجملة — مفتاح idempotency **مستقل لكل صف** (X-3). بترجّع
 * `listingId` لكل صف ناجح (مش بس `ok: true`) — عشان خطوة ربط الصور
 * بعد الإرسال (`PORTAL §4.3`) تقدر تربط كل صورة بالإعلان الصح.
 */
export function useBulkCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rows,
      uploadId,
      onProgress,
    }: {
      rows: Array<Record<string, unknown>>;
      uploadId: string;
      onProgress?: (index: number, ok: boolean, error?: string, listingId?: string) => void;
    }) => {
      const results: Array<{ index: number; ok: boolean; error?: string; listingId?: string }> =
        [];
      // بحد أقصى ٥ متوازيين — نفس توصية §4.3
      for (let i = 0; i < rows.length; i += 5) {
        const chunk = rows.slice(i, i + 5);
        await Promise.all(
          chunk.map(async (row, j) => {
            const index = i + j;
            try {
              let listingId: string;
              if (USE_MOCK) {
                await mock.latency(220);
                // الشكل مضمون من bulk/page.tsx (نفس حقول createListing بالظبط)
                listingId = mock.createListing(
                  row as Parameters<typeof mock.createListing>[0],
                ).id;
              } else {
                const created = await http<{ id: string }>('/v1/listings', {
                  method: 'POST',
                  body: row,
                  idempotency: `bulk-${uploadId}-${index}`,
                });
                listingId = created.id;
              }
              results.push({ index, ok: true, listingId });
              onProgress?.(index, true, undefined, listingId);
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'فشل غير معروف';
              results.push({ index, ok: false, error: msg });
              onProgress?.(index, false, msg);
            }
          }),
        );
      }
      return results;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/* ═══════════════════════ الاستفسارات ═══════════════════════ */

export function useMyLeads() {
  return useQuery<ChatThread[]>({
    queryKey: ['dealer', 'leads'],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getMyChats()) : http<{ items: ChatThread[] }>('/v1/chats').then((r) => r.items),
    refetchInterval: visibleRefetchInterval(60_000),
  });
}

/**
 * رسايل محادثة واحدة. الموضوع `chat:{thread_id}` **موجود فعليًا** في
 * الباك (`R-1`)، لكن شكل حمولة حدث الرسالة **مش موصوف** في أي مواصفة
 * وصلتنا (خلاف `auction:{id}` اللي §4.5 بتوصفه بالحرف) — فبدل ما
 * نخترع اسم/شكل حدث، أي إطار بيوصل على الموضوع ده بيتعامل معاه كـ
 * "تغيّر حاجة، اسحب تاني" (إبطال كاش) مش قراءة حمولته مباشرة. لما
 * الباك يوثّق شكل الحدث، السطر ده بيتحول لتحديث كاش مباشر زي المزاد
 * من غير ما يحتاج شاشة تتغيّر (`docs/REALTIME.md`).
 */
export function useLeadMessages(threadId: string | null) {
  const qc = useQueryClient();
  useRealtime(threadId ? `chat:${threadId}` : null, () => {
    qc.invalidateQueries({ queryKey: ['dealer', 'lead-messages', threadId] });
    qc.invalidateQueries({ queryKey: ['dealer', 'leads'] });
  });
  return useQuery<ChatMessage[]>({
    queryKey: ['dealer', 'lead-messages', threadId],
    enabled: Boolean(threadId),
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getThreadMessages(threadId!))
        : http<{ items: ChatMessage[] }>(`/v1/chats/${threadId}/messages`).then((r) => r.items),
    // بولينج خفيف كشبكة أمان — الموضوع موجود بس شكل حدثه مش موصوف (فوق)
    refetchInterval: visibleRefetchInterval(10_000),
  });
}

/** فتح المحادثة بيصفّر عداد غير المقروء */
export function useMarkLeadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string }) =>
      USE_MOCK
        ? m(() => mock.markThreadRead(threadId), 80)
        : http<ChatThread>(`/v1/chats/${threadId}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'leads'] }),
  });
}

/** رد المعرض من البوابة — بيحدّث المحادثة ومؤشر أول رد */
export function useSendLeadMessage() {
  const qc = useQueryClient();
  // العملية بتتحدد بمحتوى الرسالة نفسه — رسالتين بنص مختلف = عمليتين مختلفتين،
  // نفس النص المتكرر بعد فشل = إعادة محاولة لازم تاخد نفس المفتاح
  const keys = useStableIdempotencyKey('chat');
  return useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      USE_MOCK
        ? m(() => mock.sendChatMessage(threadId, body), 260)
        : http<ChatMessage>(`/v1/chats/${threadId}/messages`, {
            method: 'POST',
            body: { body },
            idempotency: keys.get(`${threadId}:${body}`),
          }),
    onSuccess: (_msg, { threadId, body }) => {
      keys.clear(`${threadId}:${body}`);
      void qc.invalidateQueries({ queryKey: ['dealer', 'lead-messages', threadId] });
      void qc.invalidateQueries({ queryKey: ['dealer', 'leads'] });
    },
  });
}

/* ═══════════════════════ المزادات ═══════════════════════ */

/** قايمة المزادات — لسه polling، مفيش موضوع WS لقايمة كل المزادات (بس واحد لكل مزاد لوحده) */
export function useDealerAuctions(status = 'live') {
  return useQuery<Auction[]>({
    queryKey: ['dealer', 'auctions', status],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAuctionsForExhibition(mock.DEMO_EXHIBITION_ID, status))
        : http<{ items: Auction[] }>(`/v1/auctions?status=${status}`).then((r) => r.items),
    // ممنوع كاش على أي حاجة تخص المزايدة
    staleTime: 0,
    refetchInterval: visibleRefetchInterval(15_000),
    refetchOnWindowFocus: true,
  });
}

/**
 * حالة مزاد واحد. **مفيش `refetchInterval` هنا تاني** — القراءة REST
 * بتحصل مرة عند فتح الشاشة (`staleTime:0` بيضمن مفيش كاش قديم)،
 * وبعد كده `useRealtime('auction:{id}')` في `/auctions/[id]` هو اللي
 * بيحدّث الكاش مباشرة من أحداث `bid.placed`/`auction.extended`/
 * `auction.ended` (§4.5 بند ١: REST الأول، WS بعدين — WS بيكمّل
 * مابيبدأش). لو الاتصال اتقطع، الشاشة بتعرض بانر + زرار تحديث يدوي —
 * **مش polling تلقائي بديل** (§4.5 بند ٢، `docs/REALTIME.md`).
 */
export function useDealerAuction(id: string) {
  return useQuery<Auction>({
    queryKey: ['dealer', 'auctions', 'one', id],
    queryFn: () =>
      USE_MOCK
        ? m(() => {
            const list = mock.getAuctionsForExhibition(mock.DEMO_EXHIBITION_ID, 'all');
            const found = list.find((a) => a.id === id);
            if (!found) throw new Error('المزاد مش موجود');
            return found;
          }, 200)
        : http<Auction>(`/v1/auctions/${id}`),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/** نفس منطق `useDealerAuction` — WS بيكمّل، مش polling (فوق) */
export function useDealerBids(auctionId: string) {
  return useQuery<AuctionBid[]>({
    queryKey: ['dealer', 'auctions', auctionId, 'bids'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAuctionBids(auctionId), 160)
        : http<AuctionBid[]>(`/v1/auctions/${auctionId}/bids`),
    enabled: Boolean(auctionId),
    staleTime: 0,
  });
}

/**
 * وضع مزايدة.
 * **`amount` لازم يكون `auction.nextBid` زي ما السيرفر رجّعه** —
 * ممنوع `currentBid + step` في الفرونت (A-3).
 */
export function usePlaceBid() {
  const qc = useQueryClient();
  // مزايدة بمبلغ مختلف = عملية جديدة؛ إعادة محاولة بنفس المبلغ = نفس المفتاح
  const keys = useStableIdempotencyKey('bid');
  return useMutation({
    mutationFn: ({ auctionId, amount }: { auctionId: string; amount: number }) =>
      USE_MOCK
        ? m(
            () =>
              mock.placeBid(auctionId, amount, {
                exhibitionId: mock.DEMO_EXHIBITION_ID,
                exhibitionName: mock.getDemoExhibition().name,
                userId: mock.getDemoExhibition().userId,
              }),
            420,
          )
        : http<{ auction: Auction; bid: AuctionBid }>(`/v1/auctions/${auctionId}/bids`, {
            method: 'POST',
            body: { amount },
            idempotency: keys.get(`${auctionId}:${amount}`),
          }),
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.auctionId}:${vars.amount}`);
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions'] });
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions', vars.auctionId, 'bids'] });
    },
  });
}

/** تسجيل الالتزام بدخول المزاد — **مش دفع**. الأدمن بيأكد التحويل. */
export function useCreateEntry() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('entry');
  return useMutation({
    mutationFn: ({ auctionId }: { auctionId: string }) =>
      USE_MOCK
        ? m(() => mock.createEntry(auctionId, mock.DEMO_EXHIBITION_ID), 500)
        : http<AuctionEntry>(`/v1/auctions/${auctionId}/entry`, {
            method: 'POST',
            idempotency: keys.get(auctionId),
          }),
    onSuccess: (_d, { auctionId }) => {
      keys.clear(auctionId);
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions'] });
      qc.invalidateQueries({ queryKey: ['dealer', 'entries'] });
    },
  });
}

/**
 * `entry.paidAt` جزء مباشر من شرط المزايدة الثالث (A-1) — نفس معاملة
 * `useDealerAuction`/`useDealerBids` (`staleTime: 0` + polling) عشان
 * تأكيد دفع الأدمن يوصل للمزايد وهو قاعد في الغرفة، مش بس عند
 * التركيز على النافذة (PORTAL §10.7).
 */
export function useMyEntries() {
  return useQuery<AuctionEntry[]>({
    queryKey: ['dealer', 'entries'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getMyEntries())
        : http<{ items: AuctionEntry[] }>('/v1/me/exhibition/entries').then((r) => r.items),
    staleTime: 0,
    refetchInterval: visibleRefetchInterval(10_000),
  });
}

export function useMyBids() {
  return useQuery<AuctionBid[]>({
    queryKey: ['dealer', 'my-bids'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.myBidsOf())
        : http<{ items: AuctionBid[] }>('/v1/auctions/mine?role=bidder').then((r) => r.items),
  });
}

/* ═══════════════════════ تعديل المخزون ═══════════════════════ */

/**
 * تعديل إعلان.
 * قيود `L-7` (عربية في مزاد شغال مايتغيّرش سعرها/عدادها/سنتها/ماركتها)
 * و`L-4` (العداد مابينقصش) بتتفرض في الفورم **قبل** ما السيرفر يرد 409 —
 * الرفض من غير شرح بيبان عشوائي للبائع.
 */
export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID);
            Object.assign(l, patch);
            return l;
          }, 520)
        : http<Listing>(`/v1/listings/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/** تعليم متباع. بيتلغي بـ`/reactivate` (L-13) — مش قرار نهائي. */
export function useMarkListingSold() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('sold');
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID);
            l.status = 'sold';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}/sold`, {
            method: 'POST',
            idempotency: keys.get(id),
          }),
    onSuccess: (_d, { id }) => {
      keys.clear(id);
      qc.invalidateQueries({ queryKey: ['dealer', 'listings'] });
    },
  });
}

/** L-13: «اتباعت» مش قرار نهائي — بترجع نشطة بنفس بياناتها */
export function useReactivateListing() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('reactivate');
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID);
            if (l.status === 'sold') l.status = 'active';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}/reactivate`, {
            method: 'POST',
            idempotency: keys.get(id),
          }),
    onSuccess: (_d, { id }) => {
      keys.clear(id);
      qc.invalidateQueries({ queryKey: ['dealer', 'listings'] });
    },
  });
}

/** تجديد — TTL ٣٠ يوم جديدة من ساعة التجديد (L-6) */
export function useRenewListing() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('renew');
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID);
            l.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
            if (l.status === 'expired') l.status = 'active';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}/renew`, {
            method: 'POST',
            idempotency: keys.get(id),
          }),
    onSuccess: (_d, { id }) => {
      keys.clear(id);
      qc.invalidateQueries({ queryKey: ['dealer', 'listings'] });
    },
  });
}

/** حذف ناعم — الإعلان بيروح من السوق وبيفضل في السجل */
export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getOwnedListing(id, mock.DEMO_EXHIBITION_ID);
            l.status = 'removed';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/**
 * رفع صورة. **أول صورة هي اللي بتفعّل الإعلان** (D-2) — قبلها الإعلان
 * `draft` ومحدش شايفه خالص.
 */
export function useUploadListingPhoto() {
  const qc = useQueryClient();
  // كل صورة عملية منفصلة — الاسم+الحجم بيميّزوا الصورة عن باقي صور نفس
  // الإعلان؛ نفس الملف بالظبط بيتراجع لو نفس النداء اتكرر بعد فشل
  const keys = useStableIdempotencyKey('photo');
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file?: File }) => {
      const disambiguator = `${id}:${file?.name ?? ''}:${file?.size ?? 0}`;
      return USE_MOCK
        ? m(() => {
            const l = mock.mockDb.listings.find((x) => x.id === id);
            // الإعلان المتعمل لسه في الديمو مش متسجّل في الموك — نجاح صامت
            if (!l) return { activated: true };
            const wasDraft = l.status === 'draft';
            l.photosCount += 1;
            if (!l.imageUrl) l.imageUrl = '/cars/corolla.jpg';
            if (wasDraft) {
              l.status = 'active';
              l.publishedAt = new Date().toISOString();
              l.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
            }
            return { activated: wasDraft };
          }, 900)
        : (() => {
            // FND-٠٤١ (المرحلة ٥): كان بيبعت الـidempotency-key بس من غير
            // بايتات الصورة خالص — رفع صورة حقيقي مكنش بيوصل للباك اند أبدًا
            const form = new FormData();
            if (file) form.append('photo', file, file.name);
            return http<{ activated: boolean }>(`/v1/listings/${id}/photos`, {
              method: 'POST',
              body: form,
              idempotency: keys.get(disambiguator),
            });
          })();
    },
    onSuccess: (_d, { id, file }) => {
      keys.clear(`${id}:${file?.name ?? ''}:${file?.size ?? 0}`);
      qc.invalidateQueries({ queryKey: ['dealer', 'listings'] });
    },
  });
}

/* ═══════════════════════ الكتالوج ═══════════════════════ */

/**
 * ماركات الكتالوج — لفلتر الماركة في `/auctions`.
 * `GET /v1/catalog/makes`. الكتالوج بيتغيّر نادر فالكاش طويل —
 * ده عكس أي حاجة تخص المزايدة (staleTime: 0).
 */
export function useCatalogMakes() {
  return useQuery<string[]>({
    queryKey: ['catalog', 'makes'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getCatalog().makes, 120)
        : http<{ items: string[] }>('/v1/catalog/makes').then((r) => r.items),
    staleTime: 3_600_000,
  });
}

/**
 * الكتالوج الكامل — ماركات وموديلاتها، محافظات ومناطقها، هياكل وألوان.
 * مرجع الفورمات والرفع بالجملة: القيمة اللي مش في الكتالوج بتتعلّم
 * أصفر وبتطلب اختيار، مش بتتخمّن (§4.3).
 *
 * في الحقيقي: `GET /v1/catalog/makes` + `/governorates` + `/filters` —
 * الـadapter هنا هو المكان الوحيد اللي بيتظبط لو شكل الرد اختلف.
 */
export function useCatalog() {
  return useQuery<Catalog>({
    queryKey: ['catalog', 'full'],
    queryFn: async () => {
      if (USE_MOCK) return m(() => mock.getCatalog(), 120);
      const [makesRes, govRes, filtersRes] = await Promise.all([
        http<{ items: Array<{ name: string; models: string[] }> }>('/v1/catalog/makes'),
        http<{ items: Array<{ name: string; areas: string[] }> }>('/v1/catalog/governorates'),
        http<{ bodies: string[]; colors: string[] }>('/v1/catalog/filters'),
      ]);
      const modelsByMake: Record<string, string[]> = {};
      for (const mk of makesRes.items) modelsByMake[mk.name] = mk.models;
      const areasByGov: Record<string, string[]> = {};
      for (const g of govRes.items) areasByGov[g.name] = g.areas;
      return {
        makes: makesRes.items.map((x) => x.name),
        modelsByMake,
        governorates: govRes.items.map((x) => x.name),
        areasByGov,
        bodies: filtersRes.bodies,
        colors: filtersRes.colors,
      };
    },
    staleTime: 3_600_000,
  });
}

/* ═══════════════════════ طلب الترقية ═══════════════════════ */

/**
 * حالة طلب الترقية بتاعي — `GET /v1/exhibitions/applications/me` (§8.2).
 * `demoStatus` بيشتغل في وضع الموك بس: بيرجّع طلب بالحالة دي عشان
 * شاشات `/apply/status` الخمسة تتراجع من غير قرار أدمن حقيقي.
 */
export function useMyApplication(demoStatus?: ApplicationStatus) {
  return useQuery<ExhibitionApplication>({
    queryKey: ['dealer', 'application', 'me', USE_MOCK ? demoStatus : undefined],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getMyApplication(demoStatus), 180)
        : http<ExhibitionApplication>('/v1/exhibitions/applications/me'),
    refetchOnWindowFocus: true,
  });
}
