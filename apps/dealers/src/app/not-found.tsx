'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Banknote,
  Boxes,
  FileSignature,
  Gavel,
  LayoutDashboard,
  MessagesSquare,
  SearchX,
  Store,
  Trophy,
} from 'lucide-react';
import { Button, PageHeader, Sheet, SectionHeader } from '@carq/ui';

/**
 * ════════════════════════════════════════════════════════════════
 * `not-found.tsx` — الصفحة المش موجودة في بوابة المعارض
 *
 * بره الـroute group بتاع `(portal)` عن قصد: الشريط الجانبي بيقرا
 * حالة التعاقد وبيعرضها، وعرضها على مسار غلط بيوهم إن الصفحة
 * بتتحمّل. هنا بنقول السبب على طول وندّي الطريق.
 * ════════════════════════════════════════════════════════════════
 */

const DESTINATIONS = [
  {
    href: '/',
    label: 'لوحة المعرض',
    hint: 'ملخّص يومك',
    icon: LayoutDashboard,
  },
  {
    href: '/inventory',
    label: 'عربياتي',
    hint: 'المخزون المعروض',
    icon: Boxes,
  },
  {
    href: '/leads',
    label: 'الاستفسارات',
    hint: 'الناس اللي سألت',
    icon: MessagesSquare,
  },
  {
    href: '/auctions',
    label: 'المزادات المتاحة',
    hint: 'الجولات المفتوحة دلوقتي',
    icon: Gavel,
  },
  {
    href: '/auctions/mine',
    label: 'مزاداتي',
    hint: 'مزايداتك واللي كسبته',
    icon: Trophy,
  },
  {
    href: '/billing',
    label: 'الرسوم والفواتير',
    hint: 'رسوم الدخول المستحقة',
    icon: Banknote,
  },
  {
    href: '/profile',
    label: 'ملف المعرض',
    hint: 'بيانات المعرض وفروعه',
    icon: Store,
  },
  {
    href: '/contract',
    label: 'حالة التعاقد',
    hint: 'اللي بيفتح المزايدة',
    icon: FileSignature,
  },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas">
      <PageHeader
        title="الصفحة دي مش موجودة"
        subtitle="المسار اللي فتحته مش متسجّل في بوابة المعارض"
        motif="swoosh"
        actions={
          <Link href="/">
            <Button variant="white" iconEnd={<ArrowLeft />}>
              الرجوع للوحة المعرض
            </Button>
          </Link>
        }
      />

      <Sheet>
        <div className="mx-auto max-w-3xl">
          <div className="flex animate-rise items-start gap-4 rounded-lg border border-line bg-surface p-5 shadow-card sm:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted-soft text-content-faint">
              <SearchX className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-title font-bold text-content">
                غالبًا الرابط اتغيّر أو فيه حرف ناقص
              </p>
              <p className="mt-1.5 text-body leading-relaxed text-content-sub">
                البوابة مالهاش صفحات مخفية — كل شاشة موجودة في الشريط الجانبي. لو الصفحة
                كانت شغالة قبل كده، يمكن تكون عربية أو مزاد اتشال. ولو لسه بتقدّم طلب
                معرض، الطلب وحالته في صفحة تقديم الطلب مش هنا.
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

          {/* المعارض اللي لسه بتقدّم — مسار بره البوابة، فبنسمّيه صراحة */}
          <div className="mt-8 flex animate-fade flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-alt px-5 py-4">
            <p className="text-sub text-content-sub">
              لسه بتقدّم طلب معرض ولسه ماتوافقش؟ حالة الطلب بتتابعها من هنا.
            </p>
            <Link href="/apply/status">
              <Button variant="outline" size="sm" iconEnd={<ArrowLeft />}>
                حالة الطلب
              </Button>
            </Link>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
