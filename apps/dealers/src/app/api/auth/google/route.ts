import { handleGoogleStart } from '@/lib/session';

/**
 * GET /api/auth/google — بيحوّل لصفحة موافقة جوجل (المرحلة ٧+).
 * راجع packages/api-client/src/server/google-oauth.ts للفلو الكامل.
 */
export const GET = handleGoogleStart;
