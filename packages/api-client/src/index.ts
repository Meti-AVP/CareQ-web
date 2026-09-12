/** CarQ API client — الأنواع، عميل الـHTTP، وطبقة الموك المؤقتة */

export * from './types';
export { ApiError, errorMessage, errorCode } from './errors';
export { http, API_URL, USE_MOCK, tokenStore, idempotencyKey } from './client';
export { nowMs } from './time';

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
