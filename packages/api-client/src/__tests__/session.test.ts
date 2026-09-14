import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * منطق الجلسة — المرحلة ٢: OTP الموك، التوكن في الذاكرة، التجديد
 * (single-flight)، ومهلة الـhttp(). كل اختبار بيقفل `fetch` بنفسه —
 * الملف ده معزول في module registry خاص بيه (vitest isolate).
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('requestOtp / verifyOtp — وضع الموك', () => {
  beforeEach(() => {
    // establishSession بتنادي POST /api/session — نموّه بنجاح دايمًا هنا
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/session')) return new Response(null, { status: 204 });
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );
  });

  it('verifyOtp بترجع هوية أدمن (ADMIN_USER) لما requiredRole=admin', async () => {
    const { verifyOtp } = await import('../auth');
    const { user } = await verifyOtp('01001234567', '1234', 'admin');
    expect(user.role).toBe('admin');
    expect(user.id).toBe('u-admin');
  });

  it('verifyOtp بترجع صاحب المعرض التجريبي لما requiredRole=exhibition', async () => {
    const { verifyOtp } = await import('../auth');
    const { getDemoExhibition } = await import('../mock/db');
    const { user } = await verifyOtp('01001234567', '1234', 'exhibition');
    expect(user.role).toBe('exhibition');
    expect(user.id).toBe(getDemoExhibition().userId);
  });

  it('verifyOtp في وضع الموك بترفض لو الرقم رقم مستخدم حقيقي بدور غلط (دخول مرفوض)', async () => {
    const { verifyOtp } = await import('../auth');
    const { tokenStore } = await import('../client');
    // 01246830664 = صاحب المعرض التجريبي (exhibition) — بيحاول يدخل
    // لوحة الأدمن (requiredRole='admin')
    await expect(verifyOtp('01246830664', '1234', 'admin')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(tokenStore.get()).toBeNull();
  });

  it('كود فاضي أو قصير ⇒ VALIDATION_ERROR', async () => {
    const { verifyOtp } = await import('../auth');
    await expect(verifyOtp('01001234567', '12', 'admin')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('verifyOtp الناجحة بتحط التوكن في tokenStore (الذاكرة بس)', async () => {
    const { verifyOtp } = await import('../auth');
    const { tokenStore } = await import('../client');
    expect(tokenStore.get()).toBeNull();
    await verifyOtp('01001234567', '1234', 'admin');
    expect(tokenStore.get()).toBeTruthy();
    tokenStore.clear();
  });

  it('requestOtp بترمي في الديمو المقفول (NEXT_PUBLIC_DEMO_MODE=false)', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
    vi.resetModules();
    const { requestOtp } = await import('../auth');
    await expect(requestOtp('01001234567')).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });
});

describe('establishSession (`POST /api/session`) — عطل شبكي عابر', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('فشل شبكي أول مرة (زي next dev لسه بيعمل compile) — إعادة محاولة واحدة بتنجح', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!String(url).includes('/api/session')) throw new Error(`unexpected fetch: ${url}`);
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return new Response(null, { status: 204 });
      }),
    );
    const { verifyOtp } = await import('../auth');
    const { user } = await verifyOtp('01001234567', '1234', 'admin');
    expect(user.role).toBe('admin');
    expect(calls).toBe(2); // محاولة واحدة فشلت + إعادة محاولة واحدة نجحت — مفيش تالتة
  });

  it('فشل شبكي في المحاولتين — رسالة تشخيصية واضحة، مش «Failed to fetch» عامة', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { verifyOtp } = await import('../auth');
    await expect(verifyOtp('01001234567', '1234', 'admin')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('npm run dev'),
    });
  });
});

describe('verifyOtp — دور غلط للوحة دي (باك اند حقيقي)', () => {
  it('user.role !== requiredRole ⇒ FORBIDDEN، والتوكن مابيتحطّش، من غير ما تتسرّب أي تفاصيل تانية', async () => {
    // USE_MOCK=false — زي بيئة فيها باك اند حقيقي متوصّل
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test');
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/v1/auth/otp/verify')) {
          // فرد عادي (role !== 'admin') بيحاول يدخل لوحة الأدمن
          return new Response(
            JSON.stringify({
              access_token: 'tok-real',
              refresh_token: 'ref-real',
              user: { id: 'u-buyer', role: 'buyer', name: 'مشتري', phone: '01001234567' },
            }),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );
    const { verifyOtp } = await import('../auth');
    const { tokenStore } = await import('../client');
    await expect(verifyOtp('01001234567', '1234', 'admin')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // مفيش توكن اتحط أصلًا — verifyOtp بتمسح قبل ما ترمي
    expect(tokenStore.get()).toBeNull();
  });
});

describe('endSession', () => {
  it('بتمسح tokenStore وتنادي /api/session/logout', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response(null, { status: 204 });
      }),
    );
    const { endSession } = await import('../auth');
    const { tokenStore } = await import('../client');
    tokenStore.set('x', 900);
    await endSession();
    expect(tokenStore.get()).toBeNull();
    expect(calls.some((u) => u.includes('/api/session/logout'))).toBe(true);
  });
});

describe('tokenStore.isExpiring', () => {
  it('false لتوكن لسه بعيد عن الانتهاء، true لما يقرب', async () => {
    const { tokenStore } = await import('../client');
    tokenStore.set('t', 900); // ١٥ دقيقة
    expect(tokenStore.isExpiring()).toBe(false);
    tokenStore.set('t', 30); // ٣٠ ثانية بس — جوه عتبة الدقيقة
    expect(tokenStore.isExpiring()).toBe(true);
    tokenStore.clear();
  });
});

describe('refreshSession — single-flight (5b)', () => {
  it('نداءين متزامنين بيشاركوا نفس طلب الشبكة', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/session/refresh')) {
          calls++;
          await new Promise((r) => setTimeout(r, 20));
          return new Response(JSON.stringify({ accessToken: 'tok-1', expiresIn: 900 }), {
            status: 200,
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    const { refreshSession } = await import('../client');
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(calls).toBe(1);
  });

  it('كوكي مش موجودة (401) ⇒ false، ومحتاج نداء جديد المرة الجاية', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        return new Response(null, { status: 401 });
      }),
    );
    const { refreshSession } = await import('../client');
    expect(await refreshSession()).toBe(false);
    expect(await refreshSession()).toBe(false);
    expect(calls).toBe(2);
  });
});

describe('http() — مهلة الطلب (6b)', () => {
  it('طلب معلّق (مش بيرد) بيتلغي بعد المهلة برسالة عربية مفهومة', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new DOMException('aborted', 'AbortError');
              reject(err);
            });
          }),
      ),
    );
    const { http } = await import('../client');
    await expect(http('/v1/slow', { timeoutMs: 15 })).rejects.toMatchObject({
      httpStatus: 408,
    });
  });

  it('فشل الشبكة (fetch بيرفض) بيتحوّل لـApiError عربي مش خطأ خام', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    const { http } = await import('../client');
    await expect(http('/v1/whatever')).rejects.toMatchObject({ name: 'ApiError' });
  });
});

describe('X-Request-Id (§5.5d)', () => {
  it('كل نداء بيبعت X-Request-Id، وبيتلحق برسالة الخطأ لو الطلب فشل', async () => {
    let sentHeader: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentHeader = (init?.headers as Record<string, string>)['X-Request-Id'];
        return new Response(
          JSON.stringify({ error: { code: 'CONFLICT', message: 'حصل خطأ', fields: null } }),
          { status: 409 },
        );
      }),
    );
    const { http } = await import('../client');
    const { errorMessage } = await import('../errors');
    let caught: unknown;
    try {
      await http('/v1/whatever');
    } catch (e) {
      caught = e;
    }
    expect(sentHeader).toBeTruthy();
    expect((caught as { requestId?: string }).requestId).toBe(sentHeader);
    expect(errorMessage(caught)).toContain('رقم المرجع');
  });

  it('مفيش رقم مرجع لخطأ محلي (مالوش نداء شبكة)', async () => {
    const { ApiError } = await import('../errors');
    const { errorMessage } = await import('../errors');
    const local = new ApiError('VALIDATION_ERROR', 'اكتب الكود كامل');
    expect(errorMessage(local)).toBe('اكتب الكود كامل');
  });
});
