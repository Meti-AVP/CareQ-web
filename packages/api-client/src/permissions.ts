/**
 * ════════════════════════════════════════════════════════════════
 * نموذج الصلاحيات المركزي — المرحلة ٣ (`ADMIN §2` · `PORTAL §5`)
 *
 * **الواجهة مش حدود أمان.** كل فحص هنا تحسين تجربة + دفاع إضافي على
 * مستوى الـmutation نفسه — الفرض الحقيقي لازم يكون سيرفر-سايد
 * (`require_role` في الباك، و`_authorize_bidder` لشروط المزايدة).
 * مصفوفة كاملة موثّقة في `docs/PERMISSIONS.md`.
 * ════════════════════════════════════════════════════════════════
 */
import type { ErrorCode, User } from './types';

/* ─────────────── الأكشنات الإدارية الخطرة (ADMIN §10) ─────────────── */

/**
 * كل الأكشنات دي محصورة على `role === 'admin'` بس حاليًا — مفيش تمايز
 * صلاحيات داخل لوحة الأدمن نفسها (`UserRole` مفيهوش `super-admin` أو
 * ما يعادله). النموذج المركزي موجود عشان:
 *  ١) قائمة موحّدة موثّقة لكل أكشن حساس (`docs/PERMISSIONS.md`)، بدل
 *     ما كل hook يفترض ضمنيًا إنه محمي لمجرد إنه تحت `/admin/*`.
 *  ٢) حارس دفاعي على مستوى الـhook/الـmutation نفسه — مش بس على
 *     مستوى الوصول للوحة (`middleware.ts`/`layout.tsx`) — لو تمايز
 *     أدوار اتضاف بعدين جوّه لوحة الأدمن نفسها، نقطة التحقق جاهزة.
 */
export type AdminAction =
  | 'exhibition.contract.set'
  | 'exhibition.application.review'
  | 'user.role.set'
  | 'user.status.set'
  | 'auction.mark_defaulted'
  | 'auction.entry.mark_paid'
  | 'listing.flags.set';

export function can(user: Pick<User, 'role'> | null | undefined, action: AdminAction): boolean {
  void action; // كل الأكشنات دلوقتي نفس الشرط — الباراميتر موجود عشان مصفوفة مستقبلية لو اتضافت أدوار إدارية
  return user?.role === 'admin';
}

/* ─────────────── شروط المزايدة الثلاثة (`ADMIN §4.4` · `PORTAL §5` · `A-1`) ─────────────── */

export interface BidConditions {
  /** `users.role == 'exhibition'` — `null` يعني بيانات المستخدمين لسه بتحمّل */
  role: boolean | null;
  /** `exhibitions.is_contracted` — المفتاح اللي الأدمن بيقلبه */
  contracted: boolean;
  /** `auction_entries.paid_at` — `null` يعني مش مسجّل في أي مزاد شغال */
  entryPaid: boolean | null;
}

type BidBlockCode = Extract<ErrorCode, 'NOT_AN_EXHIBITION' | 'NOT_CONTRACTED' | 'ENTRY_NOT_PAID'>;

/**
 * أول شرط ناقص من الثلاثة — بترتيبهم زي
 * `services/auctions.py::_authorize_bidder` بالظبط. دالة واحدة
 * مستخدمة من الاتنين: لوحة الأدمن (عرض حالة كل معرض في جدول
 * `/exhibitions`) وبوابة المعارض (حساب `canBid` في غرفة المزايدة
 * الحية) — بدل نسختين منفصلتين بنفس المنطق.
 */
export function bidBlockCode(c: BidConditions): BidBlockCode | null {
  if (c.role === false) return 'NOT_AN_EXHIBITION';
  if (!c.contracted) return 'NOT_CONTRACTED';
  if (c.entryPaid !== true) return 'ENTRY_NOT_PAID';
  return null;
}

/** رسائل عربية جاهزة للعرض — نفس النص في اللوحتين، مصدر واحد */
export const BID_BLOCK_LABEL_AR: Record<BidBlockCode, string> = {
  NOT_AN_EXHIBITION: 'حسابك مش حساب معرض',
  NOT_CONTRACTED: 'معرضك مش متعاقد',
  ENTRY_NOT_PAID: 'رسوم دخول المزاد مش مدفوعة',
};

export const BID_BLOCK_HINT_AR: Record<BidBlockCode, string> = {
  NOT_AN_EXHIBITION: 'دور المستخدم لسه مش «معرض»',
  NOT_CONTRACTED: 'المفتاح مقفول — التعاقد هو اللي بيفتح المزايدة',
  ENTRY_NOT_PAID: 'مدفعش رسوم دخول مزاد شغال',
};
