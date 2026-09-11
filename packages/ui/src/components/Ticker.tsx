'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { withThousands } from '../lib/format';

/**
 * عدّاد بيتدحرج زي عداد العربية — منقول من `motion/Ticker.tsx` في الموبايل.
 * بيتحرك من القيمة القديمة للجديدة، فتغيّر الرقم بيبان إنه حصل.
 *
 * قاعدة الحركة (HANDOFF §٣): ده الحركة البطلة في بلاطة الـKPI —
 * مفيش حركة تانية في نفس البلاطة.
 */
export function Ticker({
  value,
  duration = 900,
  className,
  prefix,
  suffix,
  format = withThousands,
  /** يظهر بقيمته النهائية فورًا — للجداول والقوايم الطويلة */
  instant = false,
}: {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  instant?: boolean;
}) {
  const [display, setDisplay] = useState(instant ? value : 0);
  const fromRef = useRef(instant ? value : 0);
  const rafRef = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(instant);

  // مايبدأش يتحرك غير لما يدخل الشاشة
  useEffect(() => {
    if (instant || seen) return;
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [instant, seen]);

  useEffect(() => {
    if (instant) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    if (!seen) return;

    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    // نفس منحنى الخروج الناعم بتاع التطبيق
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setDisplay(from + delta * ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration, instant, seen]);

  return (
    <span ref={ref} className={cn('tnum tabular-nums', className)}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
}
