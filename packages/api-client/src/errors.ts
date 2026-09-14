import type { ApiErrorBody, ErrorCode } from './types';

/**
 * خطأ الـAPI — عقد X-4.
 *
 * **الرسالة جاية من السيرفر بالعربي وجاهزة للعرض زي ما هي.**
 * متكتبش رسايل خطأ من عندك: اعرض `message`، واستخدم `code` للمنطق.
 * سبب القاعدة دي إن رسالة السيرفر بتبقى دقيقة في السبب
 * («معرضك مش متعاقد») بينما الرسالة المحلية بتبقى عامة («حصل خطأ»).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | null;
  readonly httpStatus: number;
  /**
   * معرّف الطلب (`X-Request-Id`) اللي `client.ts` بيولّده لكل نداء —
   * بيتعرض في رسالة الخطأ («رقم المرجع: …») عشان لو معرض اشتكى من
   * طلب فشل، تقدر تلاقيه في لوج الباك بسهولة (`MISSION.md §5.5d`).
   */
  readonly requestId: string | null;

  constructor(
    code: ErrorCode,
    message: string,
    fields: Record<string, string> | null = null,
    httpStatus = 400,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
  }

  static fromBody(body: ApiErrorBody, httpStatus: number, requestId: string | null = null): ApiError {
    return new ApiError(body.error.code, body.error.message, body.error.fields, httpStatus, requestId);
  }
}

/**
 * رسالة صالحة للعرض من أي خطأ — من غير ما تخترع نص. لو الخطأ جاي من
 * نداء شبكة فعلي، بيتلحق برقم مرجع قصير (`requestId`) عشان الدعم يقدر
 * يلاقي الطلب في لوج الباك (`MISSION.md §5.5d`) — مفيش رقم مرجع لأخطاء
 * التحقق المحلية (فورم فاضي وغيره) لأنها مالهاش نداء شبكة أصلًا.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return e.requestId ? `${e.message} (رقم المرجع: ${e.requestId.slice(0, 8)})` : e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'حصل خطأ غير متوقع. حاول تاني.';
}

export function errorCode(e: unknown): ErrorCode | null {
  return e instanceof ApiError ? e.code : null;
}
