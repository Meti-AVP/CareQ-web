import { beforeEach, describe, expect, it } from 'vitest';
import { mockDb, queryAudit } from '../mock/db';
import type { AuditEntry } from '../types';

/**
 * ════════════════════════════════════════════════════════════════
 * FND-037 — فلترة `/audit` بالفاعل والتاريخ على السجل كله (`ADMIN §6.3`
 * بند ٣: `?from=&to=&actor_id=`)، مش بحث نصي في الصفحة المعروضة بس.
 *
 * بنحقن صفوف تدقيق صناعية بأسماء فاعلين وتواريخ معروفة، ونتأكد إن
 * `queryAudit` بترجّع بس اللي يطابق — قبل الترقيم، على `db.auditLog`
 * كله مش أول ٣٠ صف.
 * ════════════════════════════════════════════════════════════════
 */

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: `au-test-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'u-admin',
    actorName: 'مدير النظام',
    action: 'user.status_changed',
    entityType: 'user',
    entityId: 'u-1',
    payload: {},
    createdAt: '2026-09-11T10:00:00+03:00',
    ...overrides,
  };
}

/**
 * الملف ده بيعدّل `mockDb.auditLog` مباشرة — معزول في module registry
 * خاص بيه (vitest isolate لكل ملف اختبار) فمش بيأثر على باقي الملفات،
 * زي نفس النمط في `rules.test.ts`.
 */
describe('queryAudit — فلترة الفاعل والتاريخ (FND-037)', () => {
  beforeEach(() => {
    mockDb.auditLog.length = 0;
    mockDb.auditLog.push(
      entry({ id: 'au-t1', actorName: 'مدير النظام', createdAt: '2026-09-05T10:00:00+03:00' }),
      entry({ id: 'au-t2', actorName: 'سارة عبد الله', createdAt: '2026-09-10T10:00:00+03:00' }),
      entry({ id: 'au-t3', actorName: 'سارة عبد الله', createdAt: '2026-09-12T23:50:00+03:00' }),
    );
  });

  it('actor بيدوّر بالاسم على السجل كله مش الصفحة المعروضة بس', () => {
    const page = queryAudit({ actor: 'سارة' });
    expect(page.items.map((e) => e.id).sort()).toEqual(['au-t2', 'au-t3']);
  });

  it('actor بحث جزئي وغير حساس لحالة الأحرف', () => {
    const page = queryAudit({ actor: 'مدير' });
    expect(page.items.map((e) => e.id)).toEqual(['au-t1']);
  });

  it('from بيرجّع بس الأحداث بعد بداية اليوم ده بتوقيت القاهرة (شامل)', () => {
    const page = queryAudit({ from: '2026-09-10' });
    expect(page.items.map((e) => e.id).sort()).toEqual(['au-t2', 'au-t3']);
  });

  it('to بيرجّع بس الأحداث قبل نهاية اليوم ده بتوقيت القاهرة (شامل)', () => {
    const page = queryAudit({ to: '2026-09-10' });
    expect(page.items.map((e) => e.id).sort()).toEqual(['au-t1', 'au-t2']);
  });

  it('from+to مع بعض بيحصروا مدى معيّن', () => {
    const page = queryAudit({ from: '2026-09-06', to: '2026-09-11' });
    expect(page.items.map((e) => e.id)).toEqual(['au-t2']);
  });

  it('actor + from/to مع بعض — كل الشروط لازم تتحقق', () => {
    const page = queryAudit({ actor: 'سارة', from: '2026-09-11' });
    expect(page.items.map((e) => e.id)).toEqual(['au-t3']);
  });

  it('actor مالوش نتايج بيرجّع صفحة فاضية مش كل السجل', () => {
    const page = queryAudit({ actor: 'حد مش موجود خالص' });
    expect(page.items).toEqual([]);
  });
});
