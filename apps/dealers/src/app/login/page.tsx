'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Gavel, Phone, ShieldCheck, Store } from 'lucide-react';
import {
  Button,
  Field,
  Input,
  StrokeMotif,
  formatPhone,
  withThousands,
} from '@carq/ui';
import { isEgyptianPhone, westernDigits } from '@/lib/catalog';

/**
 * ════════════════════════════════════════════════════════════════
 * `/login` — دخول بوابة المعارض
 *
 * نفس فلو الموبايل بالظبط: تليفون ثم كود OTP. مفيش باسورد عن قصد —
 * المعرض بيدخل بنفس الرقم اللي بيستقبل عليه الاستفسارات.
 *
 * الهوية: نص كحلي ونص أبيض. الكحلي هو اللي بيقول إنت فين، والأبيض
 * هو اللي بتشتغل فيه.
 * ════════════════════════════════════════════════════════════════
 */

const RESEND_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [left]);

  const phoneOk = isEgyptianPhone(phone);
  const codeOk = westernDigits(code).replace(/\D/g, '').length === 6;

  const requestCode = () => {
    setTouched(true);
    if (!phoneOk) return;
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setStep('code');
      setTouched(false);
      setLeft(RESEND_SECONDS);
    }, 600);
  };

  const verify = () => {
    setTouched(true);
    if (!codeOk) return;
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      router.push('/');
    }, 700);
  };

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* ───── النص الكحلي ───── */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-ink px-8 py-10 text-white lg:w-[46%] lg:px-12 lg:py-14">
        <StrokeMotif
          kind="circle"
          size={260}
          color="currentColor"
          strokeWidth={7}
          opacity={0.18}
          delay={260}
          duration={1600}
          className="absolute -top-10 start-[-70px] z-0 text-accent"
        />

        <div className="relative z-10">
          <span className="block text-h1 font-extrabold leading-none text-white">CarQ</span>
          <span className="mt-1 block text-sub text-white/50">بوابة المعارض</span>
        </div>

        <div className="relative z-10 mt-14 max-w-md">
          <h1 className="text-display text-white">
            مخزونك، استفساراتك، ومزاداتك — من شاشة واحدة
          </h1>
          <p className="mt-3 text-body text-white/70">
            البوابة دي شغل مكتب: رفع بالجملة، ومقارنة مزادات، ومراجعة أوراق. شاشة كبيرة بتفرق.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Store, t: 'مخزون كامل', b: 'كل عربياتك بحالاتها — والمخفي منها بيبان' },
              { icon: Gavel, t: 'مزايدة حية', b: 'سعر البداية ٨٥٪ من سعر الإعلان، والوقت من السيرفر' },
              { icon: ShieldCheck, t: 'أوراقك محمية', b: 'السجل والبطاقة بروابط موقّعة ٥ دقايق بس' },
            ].map((row) => (
              <li key={row.t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <row.icon className="h-[18px] w-[18px] text-white" />
                </span>
                <div>
                  <p className="text-title text-white">{row.t}</p>
                  <p className="text-sub text-white/60">{row.b}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 mt-14 text-caption text-white/40">
          لسه معرضك مش مسجّل؟ قدّم طلب ترقية وإحنا بنراجعه في يومين لتلاتة عمل.
        </p>
      </section>

      {/* ───── النص الأبيض ───── */}
      <section className="flex flex-1 items-center justify-center bg-canvas px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          {step === 'phone' ? (
            <>
              <h2 className="text-h1 text-content">دخول المعرض</h2>
              <p className="mt-1.5 text-body text-content-sub">
                اكتب تليفون المعرض وهنبعتلك كود تأكيد.
              </p>

              <div className="mt-7 space-y-5">
                <Field
                  label="تليفون المعرض"
                  required
                  error={touched && !phoneOk ? 'اكتب رقم مصري صحيح — موبايل أو أرضي' : undefined}
                  hint="نفس الرقم اللي بيستقبل استفسارات المشترين"
                >
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') requestCode();
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01x xxxx xxxx"
                    invalid={touched && !phoneOk}
                    className="tnum"
                  />
                </Field>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={requestCode}
                  loading={sending}
                  iconEnd={<ArrowLeft />}
                >
                  ابعت الكود
                </Button>
              </div>

              <div className="mt-8 rounded-md border border-line bg-surface px-4 py-3.5">
                <p className="text-sub font-bold text-content">لسه مش معرض؟</p>
                <p className="mt-1 text-caption text-content-sub">
                  المعرض حساب فرد اترقّى — بتقدّم طلب بالأوراق، وبعد الموافقة بيتحوّل حسابك لمعرض.
                </p>
                <Link href="/apply" className="mt-3 inline-block">
                  <Button variant="outline" size="sm" iconEnd={<ArrowLeft />}>
                    قدّم طلب معرض
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setTouched(false);
                }}
                className="mb-4 inline-flex items-center gap-1.5 text-sub font-bold text-content-sub transition-colors hover:text-content"
              >
                <ArrowRight className="h-4 w-4" />
                غيّر الرقم
              </button>

              <h2 className="text-h1 text-content">اكتب الكود</h2>
              <p className="mt-1.5 flex items-center gap-1.5 text-body text-content-sub">
                <Phone className="h-4 w-4 shrink-0" />
                بعتنا ٦ أرقام على <span className="tnum font-bold text-content">{formatPhone(phone)}</span>
              </p>

              <div className="mt-7 space-y-5">
                <Field
                  label="كود التأكيد"
                  required
                  error={touched && !codeOk ? 'الكود ٦ أرقام' : undefined}
                >
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') verify();
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="------"
                    invalid={touched && !codeOk}
                    className="tnum text-center text-h2 tracking-[0.5em]"
                  />
                </Field>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={verify}
                  loading={sending}
                  iconEnd={<ArrowLeft />}
                >
                  دخول
                </Button>

                <button
                  type="button"
                  disabled={left > 0}
                  onClick={() => setLeft(RESEND_SECONDS)}
                  className="w-full text-center text-sub font-bold text-content-sub transition-colors hover:text-content disabled:opacity-50"
                >
                  {left > 0 ? `تقدر تطلب كود جديد بعد ${withThousands(left)} ثانية` : 'ابعت الكود تاني'}
                </button>
              </div>

              <p className="mt-8 text-caption text-content-faint">
                في النسخة التجريبية أي ٦ أرقام بتدخّلك. الربط الحقيقي بـ /v1/auth/otp/verify بيحصل
                مع أول وصل بالباك اند.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
