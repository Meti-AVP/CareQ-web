import { handleGoogleCallback } from '@/lib/session';

/**
 * GET /api/auth/google/callback — جوجل بيرجّع هنا بعد الموافقة.
 * راجع packages/api-client/src/server/google-oauth.ts للفلو الكامل.
 */
export const GET = handleGoogleCallback;
