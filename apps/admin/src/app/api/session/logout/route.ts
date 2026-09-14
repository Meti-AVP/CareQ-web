import { handleLogoutSession } from '@/lib/session';

/** POST /api/session/logout — بيمسح كوكي الجلسة (المرحلة ٢) */
export const POST = handleLogoutSession;
