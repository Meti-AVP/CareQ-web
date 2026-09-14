'use client';

/**
 * ════════════════════════════════════════════════════════════════
 * hooks داشبورد الأدمن
 *
 * كل hook بيختار مصدره مرة واحدة: `USE_MOCK ? mockDb : http()`.
 * الشاشات مابتعرفش الفرق — فالتبديل للباك اند بيحصل هنا بس.
 *
 * إيقاعات التحديث (§9 — المرحلة ١ polling):
 *   · طابور بيع حالًا  : ٢٠ ثانية
 *   · لوحة الصحة       : ٣٠ ثانية
 *   · الإحصائيات       : ٥ دقايق
 *   · `refetchOnWindowFocus` في كل مكان
 *
 * **لوحة الأدمن بتفضل polling بالكامل — متتحولش لـWS** (`ADMIN §9`
 * بالحرف: «مفيش موضوع admin:* دلوقتي... متحوّلش لوحة الأدمن لـWS»).
 * كل `refetchInterval` هنا `visibleRefetchInterval()` (المرحلة ٦،
 * `docs/REALTIME.md`) — بيوقف تلقائيًا لما التاب مش ظاهر، عشان تاب
 * مقفول مفتوح على شاشة فيها ٥+ queries ميعملش بولينج مجاني للأبد.
 * ════════════════════════════════════════════════════════════════
 */
import { useRef } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import * as mock from '../mock/db';
import { http, USE_MOCK, IdempotencyKeyCache, visibleRefetchInterval } from '../client';
import { ApiError } from '../errors';
import { useSession } from '../session-context';
import { can, type AdminAction } from '../permissions';
import type {
  AdminActivityCell,
  Auction,
  AuctionBid,
  AuctionEntry,
  AuditEntry,
  BreakdownBucket,
  BreakdownDimension,
  Exhibition,
  ExhibitionApplication,
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
  User,
  UserRole,
  UserStatus,
} from '../types';

export const POLL = { queue: 20_000, health: 30_000, stats: 300_000 } as const;

/** بيشغّل الموك بتأخير بسيط عشان حالات التحميل تتشاف زي الحقيقة */
async function m<T>(fn: () => T, ms = 120): Promise<T> {
  await mock.latency(ms);
  return fn();
}

/** نسخة واحدة من `IdempotencyKeyCache` تفضل ثابتة عبر إعادة الرندر (X-3) */
function useStableIdempotencyKey(prefix: string): IdempotencyKeyCache {
  return useRef(new IdempotencyKeyCache(prefix)).current;
}

const qs = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

type Opts<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

/**
 * حارس دفاعي على مستوى الـmutation نفسه (المرحلة ٣ — `docs/PERMISSIONS.md`).
 * **دفاع إضافي مش الحد الأمني** — الوصول للوحة كلها أصلًا محصور بـ
 * `role==='admin'` من `middleware.ts`/`layout.tsx`، والفرض الحقيقي
 * لازم يكون سيرفر-سايد. بترمي بنفس شكل `ApiError` العادي عشان أي
 * صفحة تتعامل معاه زي أي خطأ سيرفر تاني (`errorMessage`/`errorCode`).
 */
function requireCan(user: Pick<User, 'role'> | null, action: AdminAction) {
  if (!can(user, action)) {
    throw new ApiError('FORBIDDEN', 'مفيش صلاحية كافية للإجراء ده', null, 403);
  }
}

/* ═══════════════════════ الإحصائيات ═══════════════════════ */

/**
 * فلاتر §4.1 بتتبعت query params زي ما هي — الباك بيفلتر الأرقام
 * المشتقة من الإعلانات بـgovernorate/make وبيقصّ المدى بـdays أو from/to.
 */
export function useOverview(filters: StatsFilters = {}, opts?: Opts<OverviewStats>) {
  return useQuery<OverviewStats>({
    queryKey: ['admin', 'overview', filters],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getOverview(filters))
        : http<OverviewStats>(`/v1/admin/stats/overview${qs({ ...filters })}`),
    refetchInterval: visibleRefetchInterval(POLL.stats),
    refetchOnWindowFocus: true,
    ...opts,
  });
}

export function useTimeseries(metric: TimeseriesMetric, days = 30, filters: StatsFilters = {}) {
  return useQuery<TimeseriesPoint[]>({
    queryKey: ['admin', 'timeseries', metric, days, filters],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getTimeseries(metric, days, filters))
        : http<{ points: TimeseriesPoint[] }>(
            `/v1/admin/stats/timeseries${qs({ metric, days, ...filters })}`,
          ).then((r) => r.points),
    refetchInterval: visibleRefetchInterval(POLL.stats),
    refetchOnWindowFocus: true,
  });
}

export function useBreakdown(dimension: BreakdownDimension, filters: StatsFilters = {}) {
  return useQuery<BreakdownBucket[]>({
    queryKey: ['admin', 'breakdown', dimension, filters],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getBreakdown(dimension, filters))
        : http<{ buckets: BreakdownBucket[] }>(
            `/v1/admin/stats/breakdown${qs({ dimension, ...filters })}`,
          ).then((r) => r.buckets),
    refetchInterval: visibleRefetchInterval(POLL.stats),
  });
}

export function useFunnel(name: 'publish' | 'sell_now' | 'financing', filters: StatsFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'funnel', name, filters],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getFunnel(name, filters))
        : http<{ steps: Array<{ key: string; label: string; count: number }> }>(
            `/v1/admin/stats/funnel${qs({ name, ...filters })}`,
          ),
    refetchInterval: visibleRefetchInterval(POLL.stats),
  });
}

/** C-52: نشاط الأدمن يوم × ساعة — endpoint ناقص في الباك (§6.2) */
export function useAdminActivity() {
  return useQuery<AdminActivityCell[]>({
    queryKey: ['admin', 'activity-heatmap'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAdminActivity())
        : http<{ cells: AdminActivityCell[] }>('/v1/admin/stats/admin-activity').then(
            (r) => r.cells,
          ),
    refetchInterval: visibleRefetchInterval(POLL.stats),
  });
}

/* ═══════════════════════ بيع حالًا ═══════════════════════ */

export function useSellNowQueue(status = 'pending', cursor: string | null = null) {
  return useQuery<Page<SellNowRequest>>({
    queryKey: ['admin', 'sell-now', status, cursor],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.querySellNow({ status, cursor }))
        : http<Page<SellNowRequest>>(`/v1/admin/sell-now/requests${qs({ status, cursor })}`),
    // الطابور ده فيه ناس مستنية فلوس — بيتحدّث كل ٢٠ ثانية
    refetchInterval: visibleRefetchInterval(POLL.queue),
    refetchOnWindowFocus: true,
  });
}

export function useSellNowRequest(id: string) {
  return useQuery<SellNowRequest>({
    queryKey: ['admin', 'sell-now', 'one', id],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getSellNow(id))
        : http<SellNowRequest>(`/v1/admin/sell-now/requests/${id}`),
    enabled: Boolean(id),
  });
}

export function usePendingCount() {
  return useQuery<number>({
    queryKey: ['admin', 'sell-now', 'pending-count'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.countSellNowPending(), 80)
        : http<Page<SellNowRequest>>('/v1/admin/sell-now/requests?status=pending').then(
            (p) => p.total ?? p.items.length,
          ),
    refetchInterval: visibleRefetchInterval(POLL.queue),
    refetchOnWindowFocus: true,
  });
}

export function useOfferSellNow() {
  const qc = useQueryClient();
  // عرض بسعر مختلف عن نفس الطلب = عملية جديدة (تصحيح سعر)؛ إعادة محاولة
  // بنفس السعر = نفس المفتاح
  const keys = useStableIdempotencyKey('offer');
  return useMutation({
    mutationFn: ({ id, price, note }: { id: string; price: number; note?: string }) =>
      USE_MOCK
        ? m(() => mock.offerSellNow(id, price, note), 500)
        : http<SellNowRequest>(`/v1/admin/sell-now/requests/${id}/offer`, {
            method: 'POST',
            body: { price },
            idempotency: keys.get(`${id}:${price}`),
          }),
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.price}`);
      qc.invalidateQueries({ queryKey: ['admin', 'sell-now'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export function useCollectSellNow() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('collect');
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      USE_MOCK
        ? m(() => mock.collectSellNow(id), 500)
        : http<SellNowRequest>(`/v1/admin/sell-now/requests/${id}/collected`, {
            method: 'POST',
            idempotency: keys.get(id),
          }),
    onSuccess: (_d, vars) => {
      keys.clear(vars.id);
      qc.invalidateQueries({ queryKey: ['admin', 'sell-now'] });
      qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/* ═══════════════════════ الإعلانات ═══════════════════════ */

export function useListings(query: mock.ListingQuery = {}) {
  return useQuery<Page<Listing>>({
    queryKey: ['admin', 'listings', query],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryListings(query))
        : http<Page<Listing>>(`/v1/admin/listings${qs(query as Record<string, unknown>)}`),
    refetchOnWindowFocus: true,
  });
}

export function useListing(id: string) {
  return useQuery<Listing>({
    queryKey: ['admin', 'listings', 'one', id],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getListing(id)) : http<Listing>(`/v1/admin/listings/${id}`),
    enabled: Boolean(id),
  });
}

/** شارات الثقة — المسار الوحيد لمنحها (T-1, T-2) */
export function useSetListingFlags() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('flags');
  return useMutation({
    mutationFn: ({
      id,
      flags,
      reason,
    }: {
      id: string;
      flags: { kmVerified?: boolean; inspected?: boolean };
      reason: string;
    }): Promise<{ kmVerified: boolean; inspected: boolean }> => {
      requireCan(user, 'listing.flags.set');
      return USE_MOCK
        ? m(() => {
            const l = mock.setListingFlags(id, flags, reason);
            return { kmVerified: l.kmVerified, inspected: l.inspected };
          }, 450)
        : http<{ km_verified: boolean; inspected: boolean }>(`/v1/admin/listings/${id}/flags`, {
            method: 'PATCH',
            body: { km_verified: flags.kmVerified, inspected: flags.inspected, reason },
            idempotency: keys.get(`${id}:${flags.kmVerified}:${flags.inspected}`),
          }).then((r) => ({ kmVerified: r.km_verified, inspected: r.inspected }));
    },
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.flags.kmVerified}:${vars.flags.inspected}`);
      qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export function useSetListingStatus() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('listing-status');
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: ListingStatus; reason: string }) =>
      USE_MOCK
        ? m(() => mock.setListingStatus(id, status, reason), 450)
        : http<Listing>(`/v1/admin/listings/${id}/status`, {
            method: 'PATCH',
            body: { status, reason },
            idempotency: keys.get(`${id}:${status}`),
          }),
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.status}`);
      qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/* ═══════════════════════ المعارض ═══════════════════════ */

export function useExhibitions(
  query: { contracted?: boolean; verified?: boolean; q?: string; cursor?: string | null } = {},
) {
  return useQuery<Page<Exhibition>>({
    queryKey: ['admin', 'exhibitions', query],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryExhibitions(query))
        : http<Page<Exhibition>>(`/v1/admin/exhibitions${qs(query)}`),
    refetchOnWindowFocus: true,
  });
}

export function useExhibition(id: string) {
  return useQuery<Exhibition>({
    queryKey: ['admin', 'exhibitions', 'one', id],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getExhibition(id)) : http<Exhibition>(`/v1/admin/exhibitions/${id}`),
    enabled: Boolean(id),
  });
}

/** المفتاح اللي بيحيي المزاد (A-1) — تأكيد مزدوج + سبب إجباري */
export function useSetContract() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('contract');
  return useMutation({
    mutationFn: ({
      id,
      isContracted,
      reason,
    }: {
      id: string;
      isContracted: boolean;
      reason: string;
    }): Promise<{ isContracted: boolean }> => {
      requireCan(user, 'exhibition.contract.set');
      return USE_MOCK
        ? m(() => ({ isContracted: mock.setContract(id, isContracted, reason).isContracted }), 500)
        : http<{ is_contracted: boolean }>(`/v1/admin/exhibitions/${id}/contract`, {
            method: 'PATCH',
            body: { is_contracted: isContracted, reason },
            idempotency: keys.get(`${id}:${isContracted}`),
          }).then((r) => ({ isContracted: r.is_contracted }));
    },
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.isContracted}`);
      qc.invalidateQueries({ queryKey: ['admin', 'exhibitions'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/**
 * مزايدات معرض واحد — لملف المعرض في الداشبورد.
 *
 * **مفيش endpoint للمسار ده في الباك لسه** (ADMIN_DASHBOARD_SPEC §6.2):
 * `GET /v1/admin/exhibitions/{id}/bids` مطلوب. البديل الوحيد دلوقتي
 * نداء لكل مزاد على حدة — يعني N+1 على صفحة واحدة.
 */
export function useExhibitionBids(exhibitionId: string) {
  return useQuery<AuctionBid[]>({
    queryKey: ['admin', 'exhibitions', 'bids', exhibitionId],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.myBidsOf(exhibitionId))
        : http<AuctionBid[]>(`/v1/admin/exhibitions/${exhibitionId}/bids`),
    enabled: Boolean(exhibitionId),
  });
}

/* ═══════════════════════ طلبات الترقية ═══════════════════════ */

export function useApplications(status = 'submitted', cursor: string | null = null) {
  return useQuery<Page<ExhibitionApplication>>({
    queryKey: ['admin', 'applications', status, cursor],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryApplications({ status, cursor }))
        : http<Page<ExhibitionApplication>>(
            `/v1/admin/exhibitions/applications${qs({ status, cursor })}`,
          ),
    refetchInterval: visibleRefetchInterval(POLL.queue),
  });
}

export function useApplication(id: string) {
  return useQuery<ExhibitionApplication>({
    queryKey: ['admin', 'applications', 'one', id],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getApplication(id))
        : http<ExhibitionApplication>(`/v1/admin/exhibitions/applications/${id}`),
    enabled: Boolean(id),
  });
}

export function useReviewApplication() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('review');
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
      fields,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'request-info';
      reason: string;
      fields?: string[];
    }): Promise<void> => {
      requireCan(user, 'exhibition.application.review');
      if (USE_MOCK) {
        return m(() => {
          if (action === 'approve') mock.approveApplication(id, reason);
          else if (action === 'reject') mock.rejectApplication(id, reason);
          else mock.requestInfoApplication(id, reason, fields ?? []);
        }, 600);
      }
      return http<void>(`/v1/admin/exhibitions/applications/${id}/${action}`, {
        method: 'POST',
        body: { reason, fields },
        idempotency: keys.get(`${id}:${action}`),
      });
    },
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.action}`);
      qc.invalidateQueries({ queryKey: ['admin', 'applications'] });
      qc.invalidateQueries({ queryKey: ['admin', 'exhibitions'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/* ═══════════════════════ المزادات ═══════════════════════ */

export function useAuctions(status = 'all', cursor: string | null = null) {
  return useQuery<Page<Auction>>({
    queryKey: ['admin', 'auctions', status, cursor],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryAuctions({ status, cursor }))
        : http<Page<Auction>>(`/v1/admin/auctions${qs({ status, cursor })}`),
    // حالة المزاد ماينفعش تتكاش (§10.7)
    staleTime: 0,
    refetchInterval: visibleRefetchInterval(POLL.queue),
  });
}

export function useAuction(id: string) {
  return useQuery<Auction>({
    queryKey: ['admin', 'auctions', 'one', id],
    queryFn: () => (USE_MOCK ? m(() => mock.getAuction(id)) : http<Auction>(`/v1/auctions/${id}`)),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useAuctionBids(id: string) {
  return useQuery<AuctionBid[]>({
    queryKey: ['admin', 'auctions', id, 'bids'],
    queryFn: () =>
      USE_MOCK ? m(() => mock.getAuctionBids(id)) : http<AuctionBid[]>(`/v1/auctions/${id}/bids`),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useAuctionEntries(auctionId?: string) {
  return useQuery<AuctionEntry[]>({
    queryKey: ['admin', 'entries', auctionId ?? 'all'],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getAuctionEntries(auctionId))
        : http<AuctionEntry[]>(`/v1/admin/auction-entries${qs({ auction_id: auctionId })}`),
  });
}

export function useMarkEntryPaid() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('entry-paid');
  return useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) => {
      requireCan(user, 'auction.entry.mark_paid');
      return USE_MOCK
        ? m(() => mock.markEntryPaid(entryId, reason), 400)
        : // كان `reason` بيتفقد هنا (باج FND-018) — الـtype كان بيطلبه
          // والموك كان بيستخدمه، بس نداء الـhttp الحقيقي ماكانش بيبعته
          // خالص، يعني السبب المكتوب (بند ٦ في المرحلة ٣) مش هيوصل
          // للسيرفر الحقيقي.
          http<AuctionEntry>(`/v1/admin/auction-entries/${entryId}/paid`, {
            method: 'POST',
            body: { reason },
            idempotency: keys.get(entryId),
          });
    },
    onSuccess: (_d, vars) => {
      keys.clear(vars.entryId);
      qc.invalidateQueries({ queryKey: ['admin', 'entries'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/** بيشتغل بس على مزاد settled — اقفل الزرار في الحالات التانية (A-11) */
export function useMarkDefaulted() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('defaulted');
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      requireCan(user, 'auction.mark_defaulted');
      return USE_MOCK
        ? m(() => mock.markAuctionDefaulted(id, reason), 500)
        : http<Auction>(`/v1/admin/auctions/${id}/default`, {
            method: 'POST',
            body: { reason },
            idempotency: keys.get(id),
          });
    },
    onSuccess: (_d, vars) => {
      keys.clear(vars.id);
      qc.invalidateQueries({ queryKey: ['admin', 'auctions'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/* ═══════════════════════ التمويل ═══════════════════════ */

export function useFinancingApps(status = 'submitted', cursor: string | null = null) {
  return useQuery<Page<FinancingApplication>>({
    queryKey: ['admin', 'financing', status, cursor],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryFinancing({ status, cursor }))
        : http<Page<FinancingApplication>>(
            `/v1/admin/financing/applications${qs({ status, cursor })}`,
          ),
    refetchInterval: visibleRefetchInterval(POLL.queue),
  });
}

export function useFinancingApp(id: string) {
  return useQuery<FinancingApplication>({
    queryKey: ['admin', 'financing', 'one', id],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.getFinancing(id))
        : http<FinancingApplication>(`/v1/admin/financing/applications/${id}`),
    enabled: Boolean(id),
  });
}

export function useSetFinancingStatus() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('financing-status');
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: FinancingStatus; reason: string }) =>
      USE_MOCK
        ? m(() => mock.setFinancingStatus(id, status, reason), 450)
        : http<FinancingApplication>(`/v1/admin/financing/applications/${id}`, {
            method: 'PATCH',
            body: { status, reason },
            idempotency: keys.get(`${id}:${status}`),
          }),
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.status}`);
      qc.invalidateQueries({ queryKey: ['admin', 'financing'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/**
 * رابط موقّع لصورة البطاقة — ٥ دقايق، وكل فتحة متسجّلة (F-6 · §10.1).
 * دي `useMutation` مش `useQuery` — مفيش `queryKey` تتخزّن تحته النتيجة
 * أصلًا، فمفيش `gcTime` تتحط هنا (الخيار ده لـ`useQuery` بس). الحماية
 * الفعلية من الكاش في الصفحة اللي بتستهلك الرابط
 * (`financing/[id]/page.tsx`): الرابط عايش في `state` مؤقت بس وبيتمسح
 * صراحة لما العداد ينتهي أو الديالوج يتقفل.
 */
export function useSignedIdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, side }: { id: string; side: 'front' | 'back' }) =>
      USE_MOCK
        ? m(() => mock.signIdImage(id, side), 350)
        : http<SignedImageUrl>(`/v1/admin/financing/applications/${id}/id-image${qs({ side })}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'audit'] }),
  });
}

/* ═══════════════════════ المستخدمين ═══════════════════════ */

export function useUsers(
  query: {
    role?: UserRole | 'all';
    status?: UserStatus | 'all';
    q?: string;
    /** pagination بالـcursor — نفس نمط useSellNowQueue */
    cursor?: string | null;
  } = {},
) {
  return useQuery<Page<User>>({
    queryKey: ['admin', 'users', query],
    queryFn: () =>
      USE_MOCK ? m(() => mock.queryUsers(query)) : http<Page<User>>(`/v1/admin/users${qs(query)}`),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('user-role');
  return useMutation({
    mutationFn: ({ id, role, reason }: { id: string; role: UserRole; reason: string }) => {
      requireCan(user, 'user.role.set');
      return USE_MOCK
        ? m(() => mock.setUserRole(id, role, reason), 500)
        : http<User>(`/v1/admin/users/${id}/role`, {
            method: 'PATCH',
            body: { role, reason },
            idempotency: keys.get(`${id}:${role}`),
          });
    },
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.role}`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  const { user } = useSession();
  const keys = useStableIdempotencyKey('user-status');
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: UserStatus; reason: string }) => {
      requireCan(user, 'user.status.set');
      return USE_MOCK
        ? m(() => mock.setUserStatus(id, status, reason), 500)
        : http<User>(`/v1/admin/users/${id}/status`, {
            method: 'PATCH',
            body: { status, reason },
            idempotency: keys.get(`${id}:${status}`),
          });
    },
    onSuccess: (_d, vars) => {
      keys.clear(`${vars.id}:${vars.status}`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/** كشف رقم مخفي — أكشن واعٍ ومتسجّل (§10.2) */
export function useRevealPhone() {
  const qc = useQueryClient();
  const keys = useStableIdempotencyKey('reveal-phone');
  return useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      USE_MOCK
        ? m(() => mock.revealPhone(userId), 200)
        : http<{ phone: string }>(`/v1/admin/users/${userId}/phone`, {
            method: 'POST',
            idempotency: keys.get(userId),
          }).then((r) => r.phone),
    onSuccess: (_d, vars) => {
      keys.clear(vars.userId);
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });
}

/* ═══════════════════════ الصحة والسكان ═══════════════════════ */

export function useHealth() {
  return useQuery<HealthSnapshot>({
    queryKey: ['admin', 'health'],
    queryFn: () => (USE_MOCK ? m(() => mock.getHealth(), 200) : http<HealthSnapshot>('/v1/admin/health')),
    refetchInterval: visibleRefetchInterval(POLL.health),
    refetchOnWindowFocus: true,
  });
}

export function useScanJobs(status = 'all', cursor: string | null = null) {
  return useQuery<Page<ScanJob>>({
    queryKey: ['admin', 'scan-jobs', status, cursor],
    queryFn: () =>
      USE_MOCK
        ? m(() => mock.queryScanJobs({ status, cursor }))
        : http<Page<ScanJob>>(`/v1/admin/scan-jobs${qs({ status, cursor })}`),
    refetchInterval: visibleRefetchInterval(POLL.health),
  });
}

/* ═══════════════════════ التدقيق ═══════════════════════ */

export function useAudit(
  query: {
    entityType?: string;
    entityId?: string;
    action?: string;
    /** FND-037 — فلترة على السجل كله، مش الصفحة المعروضة بس */
    actor?: string;
    from?: string;
    to?: string;
    cursor?: string | null;
  } = {},
) {
  return useQuery<Page<AuditEntry>>({
    queryKey: ['admin', 'audit', query],
    queryFn: () =>
      USE_MOCK ? m(() => mock.queryAudit(query)) : http<Page<AuditEntry>>(`/v1/admin/audit${qs(query)}`),
  });
}
