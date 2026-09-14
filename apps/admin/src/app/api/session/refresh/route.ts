import { handleRefreshSession } from '@/lib/session';

/**
 * POST /api/session/refresh — بيقرا كوكي الجلسة، بيجدّد، بيرجّع
 * `{accessToken, expiresIn}`. ده اللي `client.ts` بينده عليه عند ٤٠١
 * أو التجديد الاستباقي (المرحلة ٢).
 */
export const POST = handleRefreshSession;
