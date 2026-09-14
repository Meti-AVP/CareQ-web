/** رصد أخطاء الـmiddleware/edge runtime — بيتحمّل من `instrumentation.ts` */
import * as Sentry from '@sentry/nextjs';
import { SENTRY_SHARED_OPTIONS } from './src/lib/sentry-shared';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  ...SENTRY_SHARED_OPTIONS,
});
