import { handleEstablishSession } from '@/lib/session';

/**
 * POST /api/session — وسيط الجلسة، مش باك اند (المرحلة ٢).
 * بيتنادى بعد OTP verify؛ بيكتب الـrefresh في كوكي httpOnly.
 * المنطق الفعلي مشترك مع apps/dealers — راجع packages/api-client/src/server/session.ts.
 */
export const POST = handleEstablishSession;
