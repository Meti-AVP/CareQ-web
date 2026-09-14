'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  ClipboardList,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { cn, StrokeMotif, Monogram, palette, Banner, Button, SessionLoading, SessionExpired } from '@carq/ui';
import { usePendingCount, useHealth, useSession, DEMO_MODE } from '@carq/api-client';

/**
 * ════════════════════════════════════════════════════════════════
 * هيكل الداشبورد
 *
 * الشريط الجانبي كحلي (نفس حبر التطبيق) وبيتوصل بصريًا برأس الصفحة
 * الكحلي — فبيعمل نفس إحساس «الرأس الملوّن والشيت الأبيض» بتاع
 * الموبايل، بس على مقاس الديسكتوب.
 *
 * عدادان بيعيشوا في الشريط لأنهم بيحتاجوا قرار:
 *  · «مستنية قرارك» في بيع حالًا — أحمر لو > 0
 *  · مزادات متأخرة عن القفل — عَرَض وقوف الـworker
 * ════════════════════════════════════════════════════════════════
 */

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** ★ الشاشتين اللي بيفتحوا الفيتشرز الواقفة */
  key?: boolean;
}

const NAV: Array<{ section?: string; items: NavItem[] }> = [
  {
    items: [{ href: '/', label: 'نظرة عامة', icon: LayoutDashboard }],
  },
  {
    section: 'القرارات',
    items: [
      { href: '/sell-now', label: 'بيع حالًا', icon: Zap, key: true },
      { href: '/exhibitions', label: 'المعارض', icon: Building2, key: true },
      { href: '/exhibitions/requests', label: 'طلبات الترقية', icon: ClipboardList },
    ],
  },
  {
    section: 'السوق',
    items: [
      { href: '/listings', label: 'الإعلانات', icon: LayoutDashboard },
      { href: '/auctions', label: 'المزادات', icon: Gavel },
      { href: '/financing', label: 'التمويل', icon: Banknote },
      { href: '/users', label: 'المستخدمين', icon: Users },
    ],
  },
  {
    section: 'النظام',
    items: [
      { href: '/health', label: 'صحة النظام', icon: Activity },
      { href: '/audit', label: 'سجل التدقيق', icon: ScrollText },
    ],
  },
];

/** أول حرفين من الاسم — بديل «مص» المكتوب بالإيد */
function initials(name: string | undefined): string {
  if (!name) return 'مد';
  const clean = name.replace(/—.*/, '').trim();
  return clean.slice(0, 2) || 'مد';
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { status, user, logout } = useSession();
  const { data: pending } = usePendingCount();
  const { data: health } = useHealth();
  const overdue = health?.overdueAuctions ?? 0;
  const workerDown = health ? !health.workerAlive : false;

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

  const badgeFor = (href: string) => {
    if (href === '/sell-now') return pending && pending > 0 ? pending : null;
    if (href === '/auctions')
      return health && health.overdueAuctions > 0 ? health.overdueAuctions : null;
    return null;
  };

  /* حالة تحميل الجلسة — قبل ما نعرف مين الداخل (المرحلة ٢) */
  if (status === 'loading') return <SessionLoading />;
  /* انتهت الجلسة أثناء الاستخدام — شاشة واضحة، مش إعادة توجيه صامتة */
  if (status === 'expired') return <SessionExpired onRelogin={logout} />;
  /* مفيش جلسة صالحة — SessionProvider بيتولى التحويل لـ/login بالفعل */
  if (status === 'unauthenticated') return null;

  return (
    <div className="flex min-h-screen">
      {/* ───────── الشريط الجانبي ───────── */}
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
        {/* الخط المرسوم — نفس موتيف التطبيق، بيترسم مع أول تحميل */}
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

        <div className="relative z-10 flex items-center justify-between px-5 pb-6 pt-7">
          <Link href="/" className="block">
            <span className="block text-h2 font-extrabold leading-none text-white">CarQ</span>
            <span className="mt-1 block text-caption text-white/50">لوحة التحكم</span>
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
                          'group relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sub font-bold transition-colors',
                          active
                            ? 'bg-accent text-white'
                            : 'text-white/65 hover:bg-white/8 hover:text-white',
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {badge ? (
                          <span className="tnum inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-crit px-1.5 text-[11px] font-extrabold text-white">
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
          <Monogram text={initials(user?.name)} size={36} dark className="!bg-white/12 !text-white" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sub font-bold text-white">{user?.name ?? '—'}</p>
            <p className="text-caption text-white/45">مالك CarQ</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            className="shrink-0 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
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

      {/* ───────── المحتوى ───────── */}
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
        {DEMO_MODE ? (
          <Banner
            tone="warn"
            title="وضع تجريبي"
            className="rounded-none border-x-0 border-t-0"
          >
            بيانات وهمية ودخول ديمو — مفيش باك اند متوصّل لسه.
          </Banner>
        ) : null}
        {/*
          بانر عالمي — مزادات متأخرة عن القفل/العامل الخلفي واقف، في كل
          الصفحات (§4.8) — كان قبل كده بانر محلي في "/" بس (FND-038).
          مخفي في "/" لأن الصفحة دي عندها نفس البانر بالظبط بتفاصيل
          إضافية (زرار "افتح لوحة الصحة" وسياق أوسع).
        */}
        {pathname !== '/' && (workerDown || overdue > 0) ? (
          <Banner
            tone="crit"
            icon={<AlertTriangle />}
            title={
              overdue > 0
                ? `${overdue} مزاد متأخر عن القفل — العامل الخلفي واقف`
                : 'العامل الخلفي واقف'
            }
            action={
              <Button variant="danger" size="sm" onClick={() => router.push('/health')}>
                افتح لوحة الصحة
              </Button>
            }
            className="rounded-none border-x-0 border-t-0"
          >
            المزادات مابتتقفلش لوحدها وقت ما `ends_at` يعدّي، وتحليل صور السكان واقف في الطابور.
          </Banner>
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
