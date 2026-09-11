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

  constructor(
    code: ErrorCode,
    message: string,
    fields: Record<string, string> | null = null,
    httpStatus = 400,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
    this.httpStatus = httpStatus;
  }

  static fromBody(body: ApiErrorBody, httpStatus: number): ApiError {
    return new ApiError(body.error.code, body.error.message, body.error.fields, httpStatus);
  }
}

/** رسالة صالحة للعرض من أي خطأ — من غير ما تخترع نص */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'حصل خطأ غير متوقع. حاول تاني.';
}

export function errorCode(e: unknown): ErrorCode | null {
  return e instanceof ApiError ? e.code : null;
}
