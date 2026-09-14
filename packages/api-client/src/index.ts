/** CarQ API client — الأنواع، عميل الـHTTP، وطبقة الموك المؤقتة */

export * from './types';
export { ApiError, errorMessage, errorCode } from './errors';
export {
  http,
  API_URL,
  USE_MOCK,
  DEMO_MODE,
  REPORT_TIMEOUT_MS,
  tokenStore,
  idempotencyKey,
  refreshSession,
} from './client';
export { nowMs } from './time';

/** الريل تايم — المرحلة ٦ (docs/REALTIME.md) */
export {
  useRealtime,
  type RealtimeFrame,
  type RealtimeStatus,
  type BidPlacedData,
  type AuctionExtendedData,
  type AuctionEndedData,
} from './realtime';

/** طبقة الجلسة — المرحلة ٢ (docs/AUTH.md) */
export { requestOtp, verifyOtp, endSession, type VerifyOtpResult } from './auth';
export {
  SessionProvider,
  useSession,
  type SessionStatus,
  type SessionValue,
} from './session-context';

/** نموذج الصلاحيات المركزي — المرحلة ٣ (docs/PERMISSIONS.md) */
export {
  can,
  bidBlockCode,
  BID_BLOCK_LABEL_AR,
  BID_BLOCK_HINT_AR,
  type AdminAction,
  type BidConditions,
} from './permissions';

export * from './admin/hooks';
export * from './dealers/hooks';

/** أدوات الموك — بتتشال مع أول ربط بالباك اند */
export {
  mockDb,
  ADMIN_USER,
  DEMO_EXHIBITION_ID,
  getDemoExhibition,
  MOCK_NOW,
} from './mock/db';
