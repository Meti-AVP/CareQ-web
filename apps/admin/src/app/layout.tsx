import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import '@carq/ui/styles.css';
import { Providers } from '@/components/Providers';

/**
 * خط Tajawal — نفس خط تطبيق الموبايل بالظبط.
 * بيتحمّل كمتغير CSS فالـTailwind preset بيستخدمه.
 */
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CarQ Admin — لوحة التحكم',
  description: 'لوحة تحكم CarQ: بيع حالًا، المعارض، المزادات، التمويل، وصحة النظام',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dir=rtl الأصلية — المتصفح بيعكس التخطيط، من غير row-reverse يدوي
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
