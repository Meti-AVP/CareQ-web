import {
  DEALERS_SESSION_COOKIE,
  createSessionHandlers,
  createGoogleOAuthHandlers,
} from '@carq/api-client/server';

/**
 * كوكي جلسة بوابة المعارض — منفصل عن لوحة الأدمن (راجع التعليق في
 * `packages/api-client/src/server/session.ts` — المشكلة عابرة أصل
 * بسبب الـhost المشترك `localhost` محليًا، مش موجودة في الإنتاج).
 */
export const SESSION_COOKIE = DEALERS_SESSION_COOKIE;
export const { handleEstablishSession, handleRefreshSession, handleLogoutSession } =
  createSessionHandlers(SESSION_COOKIE);

/** الدخول بجوجل — خيار إضافي جنب OTP، نفس كوكي الجلسة (`docs/AUTH.md §7`) */
export const { handleGoogleStart, handleGoogleCallback } = createGoogleOAuthHandlers(
  SESSION_COOKIE,
  'exhibition',
);
