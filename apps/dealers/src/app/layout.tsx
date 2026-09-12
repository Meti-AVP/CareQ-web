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
  title: 'CarQ Dealers — بوابة المعارض',
  description: 'بوابة المعارض المتعاقدة: المخزون، الاستفسارات، ومزادات CarQ',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * dir=rtl الأصلية — المتصفح بيعكس التخطيط، من غير row-reverse يدوي.
     * translate="no": الترجمة الآلية بتعبث بنصوص الـSVG والأرقام وبتكسر
     * الرسوم — البوابة عربية أصلًا ومفيش داعي تتترجم.
     */
    <html lang="ar" dir="rtl" translate="no" className={tajawal.variable}>
      {/*
       * suppressHydrationWarning: إضافات المتصفح (Grammarly وأمثالها)
       * بتحقن خصائص في <body> قبل React — تحذير مزيف مش من الكود.
       */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
