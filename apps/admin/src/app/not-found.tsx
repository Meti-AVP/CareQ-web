'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Banknote,
  Building2,
  Gavel,
  LayoutDashboard,
  ScrollText,
  SearchX,
  Zap,
} from 'lucide-react';
import { Button, PageHeader, Sheet, SectionHeader } from '@carq/ui';

/**
 * ════════════════════════════════════════════════════════════════
 * `not-found.tsx` — الصفحة المش موجودة في لوحة التحكم
 *
 * الملف بره الـroute group بتاع `(dash)` عن قصد: المسار اللي مش
 * متسجّل مالوش شريط جانبي، وعرض شريط فيه عدادات لمسار غلط بيدي
 * إحساس إن الصفحة بتتحمّل — وهي مش موجودة أصلًا.
 *
 * بدل ما نقول «٤٠٤» ونسيب المستخدم، بنقوله السبب وبندّيه أقرب
 * المسارات اللي هو غالبًا كان رايحلها.
 * ════════════════════════════════════════════════════════════════
 */

const DESTINATIONS = [
  {
    href: '/sell-now',
    label: 'بيع حالًا',
    hint: 'الطابور اللي مستني قرارك',
    icon: Zap,
  },
  {
    href: '/exhibitions',
    label: 'المعارض',
    hint: 'التعاقد اللي بيفتح المزاد',
    icon: Building2,
  },
  {
    href: '/listings',
    label: 'الإعلانات',
    hint: 'المراجعة وشارات الثقة',
    icon: LayoutDashboard,
  },
  {
    href: '/auctions',
    label: 'المزادات',
    hint: 'الجولات والقفل',
    icon: Gavel,
  },
  {
    href: '/financing',
    label: 'التمويل',
    hint: 'طلبات التقسيط',
    icon: Banknote,
  },
  {
    href: '/health',
    label: 'صحة النظام',
    hint: 'الطابور والعامل الخلفي',
    icon: Activity,
  },
  {
    href: '/audit',
    label: 'سجل التدقيق',
    hint: 'مين عمل إيه وليه',
    icon: ScrollText,
  },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas">
      <PageHeader
        title="الصفحة دي مش موجودة"
        subtitle="المسار اللي فتحته مش متسجّل في لوحة التحكم"
        motif="swoosh"
        actions={
          <Link href="/">
            <Button variant="white" iconEnd={<ArrowLeft />}>
              الرجوع للنظرة العامة
            </Button>
          </Link>
        }
      />

      <Sheet>
        <div className="mx-auto max-w-3xl">
          {/* سبب الوصول هنا — مش رسالة خطأ جافة */}
          <div className="flex animate-rise items-start gap-4 rounded-lg border border-line bg-surface p-5 shadow-card sm:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted-soft text-content-faint">
              <SearchX className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-title font-bold text-content">
                غالبًا الرابط اتغيّر أو فيه حرف ناقص
              </p>
              <p className="mt-1.5 text-body leading-relaxed text-content-sub">
                لوحة التحكم مالهاش صفحات مخفية — كل شاشة موجودة في الشريط الجانبي. لو كنت
                جاي من رابط اتبعتلك، اتأكد إنه اتنسخ كامل. ولو الصفحة كانت شغالة قبل كده
                وبقت مش موجودة، ده معناه إن المسار اتشال — راجع سجل التدقيق.
              </p>
            </div>
          </div>

          <SectionHeader
            title="رايح فين؟"
            hint="أقرب الشاشات اللي ممكن تكون قاصدها"
            className="mt-10"
          />

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DESTINATIONS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex animate-fade items-center gap-3.5 rounded-md border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface-alt"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted-soft text-content-sub transition-colors group-hover:bg-accent-soft group-hover:text-accent">
                    <item.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-bold text-content">{item.label}</span>
                    <span className="mt-0.5 block text-caption text-content-sub">{item.hint}</span>
                  </span>
                  <ArrowLeft className="h-4 w-4 shrink-0 text-content-faint transition-colors group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
