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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as mock from '../mock/db';
import { http, USE_MOCK, idempotencyKey } from '../client';
import type {
  Auction,
  AuctionBid,
  AuctionEntry,
  ChatThread,
  Exhibition,
  ExhibitionStats,
  Listing,
} from '../types';

async function m<T>(fn: () => T, ms = 240): Promise<T> {
  await mock.latency(ms);
  return fn();
}

/* ═══════════════════════ المعرض الحالي ═══════════════════════ */

export function useMyExhibition() {
  return useQuery<Exhibition>({
    queryKey: ['dealer', 'me', 'exhibition'],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getDemoExhibition()) : http<Exhibition>('/v1/exhibitions/me'),
    refetchOnWindowFocus: true,
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
    refetchInterval: 300_000,
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

export function useMyListing(id: string) {
  return useQuery<Listing>({
    queryKey: ['dealer', 'listings', id],
    queryFn: () => (USE_MOCK ? m(() => mock.getListing(id)) : http<Listing>(`/v1/listings/${id}`)),
    enabled: Boolean(id),
  });
}

/**
 * إنشاء إعلان. **بيتولد `draft`** والصورة الأولى هي اللي بتفعّله (D-2) —
 * فالواجهة لازم تقول ده صراحة بدل ما البائع يفتكر إنه نشر.
 */
export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      USE_MOCK
        ? m(() => ({ id: `l-new-${Date.now()}`, ...payload }) as unknown as Listing, 700)
        : http<Listing>('/v1/listings', {
            method: 'POST',
            body: payload,
            // إجباري: من غيره إعادة المحاولة بتنشر العربية مرتين (X-3)
            idempotency: idempotencyKey('listing'),
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/** رفع بالجملة — مفتاح idempotency **مستقل لكل صف** (X-3) */
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
      onProgress?: (index: number, ok: boolean, error?: string) => void;
    }) => {
      const results: Array<{ index: number; ok: boolean; error?: string }> = [];
      // بحد أقصى ٥ متوازيين — نفس توصية §4.3
      for (let i = 0; i < rows.length; i += 5) {
        const chunk = rows.slice(i, i + 5);
        await Promise.all(
          chunk.map(async (row, j) => {
            const index = i + j;
            try {
              if (USE_MOCK) await mock.latency(220);
              else
                await http('/v1/listings', {
                  method: 'POST',
                  body: row,
                  idempotency: `bulk-${uploadId}-${index}`,
                });
              results.push({ index, ok: true });
              onProgress?.(index, true);
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
    refetchInterval: 60_000,
  });
}

/* ═══════════════════════ المزادات ═══════════════════════ */

export function useDealerAuctions(status = 'live') {
  return useQuery<Auction[]>({
    queryKey: ['dealer', 'auctions', status],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAuctionsForExhibition(mock.DEMO_EXHIBITION_ID, status))
        : http<{ items: Auction[] }>(`/v1/auctions?status=${status}`).then((r) => r.items),
    // ممنوع كاش على أي حاجة تخص المزايدة
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

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
    refetchInterval: 10_000,
  });
}

export function useDealerBids(auctionId: string) {
  return useQuery<AuctionBid[]>({
    queryKey: ['dealer', 'auctions', auctionId, 'bids'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAuctionBids(auctionId), 160)
        : http<AuctionBid[]>(`/v1/auctions/${auctionId}/bids`),
    enabled: Boolean(auctionId),
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

/**
 * وضع مزايدة.
 * **`amount` لازم يكون `auction.nextBid` زي ما السيرفر رجّعه** —
 * ممنوع `currentBid + step` في الفرونت (A-3).
 */
export function usePlaceBid() {
  const qc = useQueryClient();
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
            idempotency: idempotencyKey(`bid-${auctionId}`),
          }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions'] });
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions', vars.auctionId, 'bids'] });
    },
  });
}

/** تسجيل الالتزام بدخول المزاد — **مش دفع**. الأدمن بيأكد التحويل. */
export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ auctionId }: { auctionId: string }) =>
      USE_MOCK
        ? m(() => mock.createEntry(auctionId, mock.DEMO_EXHIBITION_ID), 500)
        : http<AuctionEntry>(`/v1/auctions/${auctionId}/entry`, {
            method: 'POST',
            idempotency: idempotencyKey(`entry-${auctionId}`),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dealer', 'auctions'] });
      qc.invalidateQueries({ queryKey: ['dealer', 'entries'] });
    },
  });
}

export function useMyEntries() {
  return useQuery<AuctionEntry[]>({
    queryKey: ['dealer', 'entries'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getMyEntries())
        : http<{ items: AuctionEntry[] }>('/v1/me/exhibition/entries').then((r) => r.items),
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
            const l = mock.getListing(id);
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
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getListing(id);
            l.status = 'sold';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}/sold`, {
            method: 'POST',
            idempotency: idempotencyKey(`sold-${id}`),
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/** تجديد — TTL ٣٠ يوم جديدة من ساعة التجديد (L-6) */
export function useRenewListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getListing(id);
            l.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
            if (l.status === 'expired') l.status = 'active';
            return l;
          }, 480)
        : http<Listing>(`/v1/listings/${id}/renew`, {
            method: 'POST',
            idempotency: idempotencyKey(`renew-${id}`),
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
  });
}

/** حذف ناعم — الإعلان بيروح من السوق وبيفضل في السجل */
export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => {
            const l = mock.getListing(id);
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
  return useMutation({
    mutationFn: ({ id }: { id: string; file?: File }) =>
      USE_MOCK
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
        : http<{ activated: boolean }>(`/v1/listings/${id}/photos`, {
            method: 'POST',
            idempotency: idempotencyKey(`photo-${id}`),
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer', 'listings'] }),
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
        ? m(
            () =>
              Array.from(new Set(mock.mockDb.listings.map((l) => l.make))).sort((a, b) =>
                a.localeCompare(b, 'ar'),
              ),
            120,
          )
        : http<{ items: string[] }>('/v1/catalog/makes').then((r) => r.items),
    staleTime: 3_600_000,
  });
}
