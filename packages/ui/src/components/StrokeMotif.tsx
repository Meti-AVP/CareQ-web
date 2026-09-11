'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * ════════════════════════════════════════════════════════════════
 * «الخطوط» — الموتيف البصري بتاع CarQ
 *
 * منقول حرفيًا من `src/components/motion/StrokeMotif.tsx` في الموبايل:
 * نفس مسارات الـSVG، ونفس أطوالها المحسوبة بعيّنات bezier حقيقية،
 * ونفس منحنى التوقيت. ده اللي بيخلي الويب والتطبيق حاجة واحدة.
 *
 * الحركة: سرعة شبه ثابتة زي القلم — بتبدأ ناعم وتنتهي ناعم من غير
 * فرملة مفاجئة. الرسم بيبدأ لما العنصر يدخل الشاشة (IntersectionObserver)
 * بدل ما يترسم وهو مخفي.
 *
 * الأطوال دي محسوبة، مش مخمّنة — طول غلط = وقت ميت في الرسم.
 * ════════════════════════════════════════════════════════════════
 */

export type MotifKind = 'circle' | 'oval' | 'underline' | 'swoosh' | 'ribbon';

interface Shape {
  d: string;
  len: number;
  /** ارتفاع الـviewBox — الافتراضي 100 (مربع) */
  vbH?: number;
}

const SHAPES: Record<MotifKind, Shape> = {
  // دايرة ماركر: تبدأ فوق، تلف، وتعدّي البداية بذيل بيتداخل مع أولها
  circle: {
    d:
      'M50 8 C72 6 92 22 92 42 C92 62 76 84 52 88 ' +
      'C30 92 12 78 8 58 C4 38 16 18 38 11 ' +
      'C46 8 56 8 64 11 C71 14 77 19 80 25',
    len: 295,
  },
  oval: {
    d:
      'M50 16 C72 14 92 25 94 40 C96 56 78 68 52 69 ' +
      'C27 70 8 60 6 45 C4 30 22 18 46 16 C57 15 68 18 75 23',
    len: 254,
  },
  underline: {
    d: 'M6 58 C28 48 62 46 94 52 M14 72 C34 65 60 64 82 68',
    len: 159,
  },
  swoosh: {
    d: 'M6 74 C22 34 56 16 94 26 C78 30 62 38 52 52',
    len: 162,
  },
  ribbon: {
    d:
      'M10 -10 C46 8 78 16 82 44 C86 70 62 82 44 70 ' +
      'C28 58 38 36 60 38 C86 42 90 84 64 98 ' +
      'C40 110 18 112 14 138 C10 166 36 176 56 166 ' +
      'C80 154 88 180 76 202 C66 222 36 224 24 246 ' +
      'C14 264 30 284 54 288 C66 290 76 296 74 306',
    len: 632,
    vbH: 300,
  },
};

interface Props {
  kind?: MotifKind;
  size?: number;
  color?: string;
  /** سماكة الفرشاة — الافتراضي سميك زي الملصق */
  strokeWidth?: number;
  duration?: number;
  delay?: number;
  opacity?: number;
  /** يظهر مرسوم جاهز من غير أنيميشن */
  instant?: boolean;
  className?: string;
}

export function StrokeMotif({
  kind = 'circle',
  size = 150,
  color = 'currentColor',
  strokeWidth = 7,
  duration = 1500,
  delay = 200,
  opacity = 1,
  instant = false,
  className,
}: Props) {
  const shape = SHAPES[kind];
  const vbH = shape.vbH ?? 100;
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(instant);

  useEffect(() => {
    if (instant) return;
    const node = ref.current;
    if (!node) return;
    // الرسم بيبدأ لما الخط يدخل الشاشة فعلًا — مش وهو تحت الطية
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [instant]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none select-none', className)}
      style={{ width: size, height: (size * vbH) / 100, opacity }}
    >
      <svg
        width={size}
        height={(size * vbH) / 100}
        viewBox={`0 0 100 ${vbH}`}
        fill="none"
        style={{ overflow: 'visible' }}
      >
        <path
          d={shape.d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={drawn && !instant ? 'motif-draw' : undefined}
          style={
            instant
              ? undefined
              : ({
                  '--motif-len': shape.len,
                  '--motif-dur': `${duration}ms`,
                  '--motif-delay': `${delay}ms`,
                  strokeDasharray: shape.len,
                  strokeDashoffset: drawn ? undefined : shape.len,
                } as React.CSSProperties)
          }
        />
      </svg>
    </div>
  );
}
