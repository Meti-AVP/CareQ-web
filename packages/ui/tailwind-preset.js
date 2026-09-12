/**
 * CarQ Tailwind preset — بيترجم رموز التصميم في src/tokens.ts لكلاسات.
 * التطبيقين (admin + dealers) بيورثوه فالهوية واحدة بالظبط.
 *
 * القيم مكتوبة هنا مرة تانية عن قصد: Tailwind config بيتحمّل في Node
 * وقت البناء ومينفعش يستورد TS. التوكنز هي المرجع — أي تغيير هناك
 * لازم ينزل هنا (والاتنين في نفس الـPR).
 */

/** لون من قناة CSS مع دعم معدّل الشفافية بتاع Tailwind */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      /*
       * الألوان بتقرا من قنوات RGB في styles.css (--c-*) — مش أرقام ثابتة —
       * عشان الوضع الغامق يقلب الأسطح فعلًا، ومعدّلات الشفافية
       * (bg-crit-soft/40 · border-accent/25) تفضل شغالة في الوضعين.
       * القيم الفاتحة مطابقة لـsrc/tokens.ts بالحرف.
       */
      colors: {
        ink: {
          DEFAULT: c('ink'),
          soft: c('ink-soft'),
          border: c('ink-border'),
        },
        canvas: c('canvas'),
        surface: {
          DEFAULT: c('surface'),
          alt: c('surface-alt'),
        },
        line: {
          DEFAULT: c('line'),
          strong: c('line-strong'),
        },
        content: {
          DEFAULT: c('content'),
          sub: c('content-sub'),
          faint: c('content-faint'),
        },
        accent: {
          DEFAULT: c('accent'),
          soft: c('accent-soft'),
          ink: c('accent-ink'),
        },
        ok: { DEFAULT: c('ok'), soft: c('ok-soft') },
        warn: { DEFAULT: c('warn'), soft: c('warn-soft') },
        crit: { DEFAULT: c('crit'), soft: c('crit-soft') },
        muted: { DEFAULT: c('muted'), soft: c('muted-soft') },
      },
      borderRadius: {
        xs: '10px',
        sm: '14px',
        md: '18px',
        lg: '24px',
        xl: '30px',
      },
      fontFamily: {
        sans: ['var(--font-tajawal)', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['34px', { lineHeight: '46px', fontWeight: '800' }],
        h1: ['27px', { lineHeight: '39px', fontWeight: '800' }],
        h2: ['22px', { lineHeight: '33px', fontWeight: '700' }],
        title: ['18px', { lineHeight: '27px', fontWeight: '700' }],
        body: ['16px', { lineHeight: '25px', fontWeight: '500' }],
        sub: ['14.5px', { lineHeight: '22px', fontWeight: '500' }],
        caption: ['13px', { lineHeight: '19px', fontWeight: '500' }],
      },
      boxShadow: {
        card: '0 8px 16px rgba(19,26,46,0.06)',
        float: '0 12px 24px rgba(19,26,46,0.16)',
        pop: '0 2px 8px rgba(19,26,46,0.08)',
      },
      keyframes: {
        /** دخول هادي — نفس منحنى الموبايل ومسافاته القصيرة */
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        /** الشيت الأبيض بيطلع من تحت الرأس الملوّن */
        sheet: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /** لمعة بتعدّي مرة — Shine في الموبايل */
        shine: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        /** نبضة الحالة الحية — PulseDot */
        halo: {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        shimmer: {
          '0%,100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 220ms cubic-bezier(0.33,1,0.68,1) both',
        fade: 'fade 240ms cubic-bezier(0.33,1,0.68,1) both',
        sheet: 'sheet 320ms cubic-bezier(0.33,1,0.68,1) both',
        shine: 'shine 1400ms cubic-bezier(0.4,0,0.2,1) 600ms both',
        halo: 'halo 1400ms linear infinite',
        shimmer: 'shimmer 1100ms linear infinite',
      },
    },
  },
  plugins: [],
};
