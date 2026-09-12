import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge لازم يتعرّف على أسماء المقاسات المخصوصة بتاعتنا
 * (text-body · text-sub · …) كمقاسات خط، مش ألوان. من غير كده كان
 * بيعتبر `text-body` لون وبيشيل `text-white` من الأزرار — نص أبيض
 * على خلفية كحلي كان بيتحوّل لنص كحلي مخفي. (نفس الحكاية لظلال
 * وتدويرات الحواف المخصوصة.)
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h1', 'h2', 'title', 'body', 'sub', 'caption'] }],
      rounded: [{ rounded: ['xs'] }],
      shadow: [{ shadow: ['card', 'float', 'pop'] }],
    },
  },
});

/** دمج كلاسات Tailwind مع حل التعارضات */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
