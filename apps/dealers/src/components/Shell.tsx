'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Banknote,
  Boxes,
  FileSignature,
  Gavel,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Store,
  Trophy,
  X,
} from 'lucide-react';
import { cn, Monogram, StrokeMotif, palette } from '@carq/ui';
import { useMyExhibition, useMyEntries, useMyLeads } from '@carq/api-client';

/**
 * هيكل بوابة المعارض — نفس هيكل داشبورد الأدمن بالظبط
 * (فريق واحد، مكوّنات واحدة). الفرق الوحيد: المحتوى والحارس.
 *
 * حالة التعاقد بتعيش في الشريط الجانبي لأنها بتحكم أهم فيتشر
 * في البوابة كلها: المزايدة (A-1).
 */

const NAV = [
  {
    items: [{ href: '/', label: 'لوحة المعرض', icon: LayoutDashboard }],
  },
  {
    section: 'المخزون',
    items: [
      { href: '/inventory', label: 'عربياتي', icon: Boxes },
      { href: '/leads', label: 'الاستفسارات', icon: MessagesSquare },
    ],
  },
  {
    section: 'المزادات',
    items: [
      { href: '/auctions', label: 'المزادات المتاحة', icon: Gavel },
      { href: '/auctions/mine', label: 'مزاداتي', icon: Trophy },
      { href: '/billing', label: 'الرسوم والفواتير', icon: Banknote },
    ],
  },
  {
    section: 'المعرض',
    items: [
      { href: '/profile', label: 'ملف المعرض', icon: Store },
      { href: '/contract', label: 'حالة التعاقد', icon: FileSignature },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: exhibition } = useMyExhibition();
  const { data: entries } = useMyEntries();
  const { data: leads } = useMyLeads();

  // الدرج المفتوح على الموبايل بيقفل سكرول الصفحة اللي وراه
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const unpaid = (entries ?? []).filter((e) => e.paidAt === null).length;
  const unread = (leads ?? []).reduce((s, l) => s + l.unread, 0);

  const badgeFor = (href: string) => {
    if (href === '/billing') return unpaid || null;
    if (href === '/leads') return unread || null;
    return null;
  };

  return (
    <div className="flex min-h-screen">
      {/*
        الدرج على ناحية البداية (يمين في RTL) — نفس مكانه المثبّت على الديسكتوب.
        وهو مقفول بينزاح لبره يمين (translate-x-full بيتحرك يمين فعليًا)،
        فمابيبقاش واقف في نص الشاشة زي ما كان بيحصل مع end-0.
      */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-[248px] flex-col overflow-hidden bg-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <StrokeMotif
          kind="ribbon"
          size={120}
          color={palette.accent}
          strokeWidth={6}
          opacity={0.14}
          delay={400}
          duration={1800}
          className="pointer-events-none absolute -top-6 start-[-30px]"
        />

        <div className="relative z-10 flex items-center justify-between px-5 pb-5 pt-7">
          <Link href="/" className="block">
            <span className="block text-h2 font-extrabold leading-none text-white">CarQ</span>
            <span className="mt-1 block text-caption text-white/50">بوابة المعارض</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/60 lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* حالة التعاقد — بتحكم المزايدة، فمكانها فوق مش مدفونة */}
        {exhibition ? (
          <div className="relative z-10 mx-3 mb-4 rounded-sm bg-white/8 px-3 py-2.5">
            <p className="truncate text-sub font-bold text-white">{exhibition.name}</p>
            <p
              className={cn(
                'mt-1 flex items-center gap-1.5 text-caption font-bold',
                exhibition.isContracted ? 'text-ok' : 'text-accent',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  exhibition.isContracted ? 'bg-ok' : 'bg-accent',
                )}
              />
              {exhibition.isContracted ? 'متعاقد · المزايدة مفتوحة' : 'مش متعاقد · المزايدة مقفولة'}
            </p>
          </div>
        ) : null}

        <nav className="relative z-10 flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-6' : ''}>
              {group.section ? (
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-white/35">
                  {group.section}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const badge = badgeFor(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-sm px-3 py-2.5 text-sub font-bold transition-colors',
                          active
                            ? 'bg-accent text-white'
                            : 'text-white/65 hover:bg-white/8 hover:text-white',
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {badge ? (
                          <span className="tnum inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-extrabold text-white">
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="relative z-10 flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <Monogram
            text={exhibition?.name.slice(0, 2) ?? 'مع'}
            size={36}
            dark
            className="!bg-white/12 !text-white"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sub font-bold text-white">
              {exhibition?.ownerName ?? 'صاحب المعرض'}
            </p>
            <p className="text-caption text-white/45">{exhibition?.governorate ?? ''}</p>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="إغلاق"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink/50 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="sticky top-0 z-20 flex items-center gap-2 bg-ink px-5 py-4 text-white lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
          <span className="text-sub font-bold">CarQ</span>
        </button>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
