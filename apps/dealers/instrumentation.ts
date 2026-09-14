import * as Sentry from '@sentry/nextjs';

/** Next.js بينادي الدالة دي مرة واحدة عند إقلاع السيرفر (`node`/`edge`) */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/** بيرصد أي خطأ في route handlers/server components ماتلقطش يدويًا */
export const onRequestError = Sentry.captureRequestError;
