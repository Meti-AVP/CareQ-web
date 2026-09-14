'use client';

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Chrome, ChevronRight, Info, Lock, Phone, ShieldCheck } from 'lucide-react';
import {
  Button,
  Field,
  Input,
  StrokeMotif,
  cn,
  formatPhone,
} from '@carq/ui';
import { errorMessage, requestOtp as apiRequestOtp, verifyOtp as apiVerifyOtp, DEMO_MODE } from '@carq/api-client';

/** رسايل `?error=` الراجعة من `/api/auth/google/callback` — نص عربي جاهز للعرض */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'الدخول بجوجل لسه مش متظبط على السيرفر — استخدم كود التليفون.',
  google_demo_closed: 'وضع الديمو مقفول لدخول جوجل حاليًا — استخدم كود التليفون.',
  google_cancelled: 'اتلغى الدخول بجوجل.',
  google_forbidden: 'الحساب ده مش مصرّح له.',
  google_failed: 'حصل خطأ في الدخول بجوجل — جرّب تاني أو استخدم كود التليفون.',
};

/**
 * ════════════════════════════════════════════════════════════════
 * `/login` — دخول لوحة تحكم CarQ (ADMIN_DASHBOARD_SPEC §2)
 *
 * الصفحة دي بره الـroute group بتاع الداشبورد عن قصد: مفيش Shell
 * ولا شريط جانبي — اللي لسه مادخلش مالوش إن فيه داشبورد أصلًا.
 *
 * **مفيش إنشاء حساب أدمن. خالص.** الدور `admin` بيتحط يدوي في
 * الداتابيز (`users.role`) — ده مقصود مش نقص.
 *
 * ──────────────── ملاحظة أمان (المرحلة ٢ — مبنية) ────────────────
 *  · الفلو: `requestOtp` → `verifyOtp` من `@carq/api-client` (`auth.ts`)
 *    بينده على POST /v1/auth/otp/request ثم /v1/auth/otp/verify، ولو
 *    `user.role !== 'admin'` بيمسح التوكن ويرمي خطأ من غير ما يقول
 *    إن فيه داشبورد أصلًا.
 *  · `access_token` بيتحفظ في **الذاكرة بس** عن طريق `tokenStore` —
 *    مش `localStorage` ولا `sessionStorage`.
 *  · `refresh_token` بيتحفظ في **httpOnly cookie** بيتكتب من
 *    route handler (`POST /api/session`) — الجافاسكريبت عمره ما
 *    يشوفه، والتجديد الصامت بيحصل من السيرفر (`I-4`).
 *  · عند 401: تجديد مرة واحدة وإعادة المحاولة، وبعدها خروج
 *    (متطبّق في `client.ts`).
 * ════════════════════════════════════════════════════════════════
 */

/** ١١ رقم بادئتها 010 أو 011 أو 012 أو 015 — نفس تحقق الموبايل */
const EGYPT_MOBILE = /^01[0125]\d{8}$/;

const OTP_LENGTH = 4;
const RESEND_SECONDS = 30;

/** `useSearchParams()` محتاجة Suspense boundary عشان الصفحة تفضل static-prerendered */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** مسار الرجوع بعد الدخول — middleware.ts بيحطه لما يمنع وصول مباشر.
      لازم مسار داخلي (`/xxx`) بس — غير كده ده باب open-redirect. */
  const rawNext = searchParams.get('next') ?? '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const googleError = searchParams.get('error');

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(
    googleError ? (GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.google_failed!) : null,
  );
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  /* عدّاد إعادة الإرسال */
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  /* أول ما نوصل خطوة الكود، الخانة الأولى بتاخد التركيز */
  useEffect(() => {
    if (step === 'otp') otpRefs.current[0]?.focus();
  }, [step]);

  const digits = phone.replace(/\D/g, '').slice(0, 11);
  const phoneValid = EGYPT_MOBILE.test(digits);
  const codeValue = code.join('');
  const codeComplete = codeValue.length === OTP_LENGTH;

  /* ───────── خطوة ١: الرقم ───────── */
  async function onRequestOtp() {
    if (!phoneValid) {
      setError('الرقم لازم يكون ١١ رقم ويبدأ بـ 010 أو 011 أو 012 أو 015');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await apiRequestOtp(digits);
      setStep('otp');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ───────── خطوة ٢: الكود ───────── */
  async function onVerifyOtp(value = codeValue) {
    if (value.length !== OTP_LENGTH) {
      setError('اكتب الكود كامل — ٤ أرقام');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // لو role !== 'admin': verifyOtp بترمي FORBIDDEN من غير ما تقول
      // إن فيه داشبورد أصلًا (ADMIN_DASHBOARD_SPEC §2) — نفس الرسالة
      // بتتعرض زي ما هي (X-4)
      await apiVerifyOtp(digits, value, 'admin');
      router.push(next);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function setDigit(index: number, raw: string) {
    const d = raw.replace(/\D/g, '');
    if (!d) {
      setCode((prev) => prev.map((c, i) => (i === index ? '' : c)));
      return;
    }
    setCode((prev) => {
      const next = [...prev];
      // لصق أكتر من رقم في خانة واحدة بيتوزّع على الخانات اللي بعدها
      d.split('').forEach((ch, k) => {
        if (index + k < OTP_LENGTH) next[index + k] = ch;
      });
      return next;
    });
    const jump = Math.min(index + d.length, OTP_LENGTH - 1);
    otpRefs.current[jump]?.focus();
  }

  function onOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    // Enter بيتسلّم للفورم نفسه — مانعملوش هنا عشان مايتنادىش مرتين
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      e.preventDefault();
      setCode((prev) => prev.map((c, i) => (i === index - 1 ? '' : c)));
      otpRefs.current[index - 1]?.focus();
    }
  }

  function onOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => (next[i] = ch));
    setCode(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    if (pasted.length === OTP_LENGTH) void onVerifyOtp(pasted);
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ───────────── النص الكحلي: الهوية ───────────── */}
      <section className="relative overflow-hidden bg-ink px-6 py-10 text-white lg:w-[46%] lg:px-12 lg:py-14">
        {/* الحركة البطلة الوحيدة في الشاشة — الخط بيترسم مع الدخول */}
        {/* اللون من كلاس الهوية مش hex ثابت — currentColor بيرث text-accent */}
        <StrokeMotif
          kind="ribbon"
          size={260}
          color="currentColor"
          strokeWidth={7}
          opacity={0.2}
          delay={260}
          duration={1900}
          className="pointer-events-none absolute -top-16 start-[-70px] text-accent"
        />

        <div className="relative z-10 flex h-full flex-col">
          <div className="animate-rise">
            <span className="block text-display font-extrabold leading-none">CarQ</span>
            <span className="mt-2 block text-h2 text-white/70">لوحة التحكم</span>
          </div>

          <div className="mt-10 max-w-md lg:mt-auto">
            <p className="text-h2 leading-relaxed text-white">
              القرارات اللي السوق واقف عليها بتتاخد من هنا.
            </p>
            <p className="mt-3 text-body text-white/60">
              عروض بيع حالًا، تعاقدات المعارض اللي بتفتح المزاد، شارات الثقة، وصحة العامل
              الخلفي. كل أكشن بيتسجّل في سجل التدقيق باسمك وبالسبب اللي كتبته.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                { icon: <Lock />, text: 'التوكن في الذاكرة بس — مش متخزّن في المتصفح' },
                { icon: <ShieldCheck />, text: 'الدور بيتقرا من الداتابيز مع كل طلب' },
                { icon: <Info />, text: 'مفيش إنشاء حساب — الدور بيتحط يدوي' },
              ].map((row) => (
                <li key={row.text} className="flex items-center gap-3 text-sub text-white/60">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 [&>svg]:h-4 [&>svg]:w-4">
                    {row.icon}
                  </span>
                  {row.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────────── النص الأبيض: الفورم ───────────── */}
      <section className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-[420px] animate-rise rounded-xl border border-line bg-surface p-7 shadow-float sm:p-9">
          {step === 'phone' ? (
            <>
              <h1 className="text-h1 text-content">تسجيل الدخول</h1>
              <p className="mt-2 text-body text-content-sub">
                اكتب رقم الموبايل المسجّل كأدمن، وهنبعتلك كود تأكيد على نفس الرقم.
              </p>

              <form
                className="mt-7 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onRequestOtp();
                }}
              >
                <Field
                  label="رقم الموبايل"
                  required
                  error={error ?? undefined}
                  hint={!error ? 'مثال: 01001234567' : undefined}
                >
                  <div className="relative">
                    <Phone className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-content-faint" />
                    <Input
                      dir="ltr"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      autoFocus
                      value={phone}
                      invalid={Boolean(error)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 14));
                        if (error) setError(null);
                      }}
                      placeholder="01xxxxxxxxx"
                      className="h-12 ps-10 text-start text-title tracking-[0.08em]"
                    />
                  </div>
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={busy}
                  disabled={!phoneValid}
                  iconEnd={<ArrowLeft />}
                >
                  ابعت كود التأكيد
                </Button>
              </form>

              {/* ───────── بديل: الدخول بجوجل — خيار إضافي جنب الكود، مش بدل منه ───────── */}
              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                <span className="text-caption text-content-faint">أو</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <a href="/api/auth/google" className="block">
                <Button type="button" variant="outline" size="lg" className="w-full" icon={<Chrome />}>
                  الدخول بحساب Google
                </Button>
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode(Array(OTP_LENGTH).fill(''));
                  setError(null);
                }}
                className="mb-5 inline-flex items-center gap-1 text-sub font-bold text-content-sub transition-colors hover:text-content"
              >
                <ChevronRight className="h-4 w-4" />
                غيّر الرقم
              </button>

              <h1 className="text-h1 text-content">اكتب الكود</h1>
              <p className="mt-2 text-body text-content-sub">
                بعتنا كود من ٤ أرقام على{' '}
                <span className="tnum font-bold text-content" dir="ltr">
                  {formatPhone(digits)}
                </span>
              </p>

              <form
                className="mt-7 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onVerifyOtp();
                }}
              >
                {/* الخانات LTR — الأرقام بتتقرا من الشمال لليمين حتى في واجهة عربية */}
                <div dir="ltr" className="flex justify-center gap-3">
                  {code.map((c, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      value={c}
                      onChange={(e) => {
                        setDigit(i, e.target.value);
                        if (error) setError(null);
                      }}
                      onKeyDown={(e) => onOtpKeyDown(i, e)}
                      onPaste={onOtpPaste}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={OTP_LENGTH}
                      aria-label={`الرقم ${i + 1} من ${OTP_LENGTH}`}
                      className={cn(
                        'tnum h-16 w-14 rounded-sm border bg-surface-alt text-center text-h1 text-content outline-none transition-colors',
                        error
                          ? 'border-crit'
                          : c
                            ? 'border-accent bg-surface'
                            : 'border-line focus:border-accent focus:bg-surface',
                      )}
                    />
                  ))}
                </div>

                {error ? (
                  <p className="text-center text-caption font-bold text-crit">{error}</p>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={busy}
                  disabled={!codeComplete}
                  iconEnd={<ArrowLeft />}
                >
                  ادخل على اللوحة
                </Button>

                <div className="text-center">
                  {resendIn > 0 ? (
                    <p className="text-caption text-content-faint">
                      تقدر تطلب كود تاني بعد{' '}
                      <span className="tnum font-bold text-content-sub">{resendIn}</span> ثانية
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void apiRequestOtp(digits);
                        setResendIn(RESEND_SECONDS);
                        setCode(Array(OTP_LENGTH).fill(''));
                        setError(null);
                        otpRefs.current[0]?.focus();
                      }}
                      className="text-caption font-bold text-accent transition-opacity hover:opacity-75"
                    >
                      ابعت الكود تاني
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          {/* ───── ملاحظة الصلاحيات ───── */}
          <div className="mt-8 rounded-md border border-line bg-surface-alt px-4 py-3.5">
            <p className="flex items-center gap-2 text-sub font-bold text-content">
              <ShieldCheck className="h-4 w-4 shrink-0 text-content-sub" />
              مفيش إنشاء حساب أدمن
            </p>
            <p className="mt-1 text-caption text-content-sub">
              الدور بيتحط يدوي في الداتابيز. لو الرقم ده مش مربوط بحساب أدمن، الدخول هيترفض
              من غير أي تفاصيل.
            </p>
          </div>

          {DEMO_MODE ? (
            <p className="mt-4 text-center text-caption text-content-faint">
              وضع الديمو: أي رقم مصري صحيح وأي كود بيعدّي — مفيش باك اند متوصّل لسه.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
