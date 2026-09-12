/**
 * ════════════════════════════════════════════════════════════════
 * سكريبت التحقق الشامل — `npm run verify`
 *
 * بيشغّل كل خطوط الدفاع بالترتيب، وبيصلّح تلقائيًا اللي ينفع يتصلّح:
 *
 *   ١. تثبيت الحزم لو node_modules ناقصة          (إصلاح تلقائي)
 *   ٢. ESLint بوضع --fix على التطبيقين             (إصلاح تلقائي)
 *   ٣. فحص الأنواع TypeScript على الأربع حزم
 *   ٤. اختبارات الوحدات — قواعد البيزنس والتنسيق والأمان (81+)
 *   ٥. الفحوصات الثابتة — أنماط الكود الممنوعة
 *   ٦. بناء إنتاجي كامل للوحتين
 *
 * بيطبع تقرير نهائي واضح، وexit code 1 لو أي خطوة فشلت —
 * ينفع يتحط زي ما هو في CI أو يتشغّل قبل أي تسليم.
 *
 * اختبار المتصفح (اللي بيتصرف كمستخدم حقيقي وبياخد سكرينشوتس)
 * سكريبت منفصل: `npm run e2e` — شوف playwright.config.ts
 * ════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const line = (ch = '─') => console.log(ch.repeat(64));
const say = (msg) => console.log(`\n${msg}`);

/** بيشغّل أمر وبيرجّع نجح/فشل — الخرج بيظهر مباشرة للمستخدم */
function run(cmd, args, opts = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true, // عشان npm/npx على ويندوز
    ...opts,
  });
  return { ok: res.status === 0, seconds: Math.round((Date.now() - started) / 1000) };
}

const results = [];
let aborted = false;

function step(name, fn, { fatal = false } = {}) {
  if (aborted) {
    results.push({ name, status: 'skipped', seconds: 0 });
    return;
  }
  line('═');
  console.log(`◆ ${name}`);
  line('═');
  const { ok, seconds } = fn();
  results.push({ name, status: ok ? 'passed' : 'failed', seconds });
  if (!ok && fatal) aborted = true;
}

/* ─────────────── ١) الحزم ─────────────── */
step(
  'الحزم — node_modules موجودة وسليمة',
  () => {
    if (existsSync(join(ROOT, 'node_modules', '.package-lock.json'))) {
      console.log('موجودة — مفيش حاجة تتعمل.');
      return { ok: true, seconds: 0 };
    }
    console.log('ناقصة — بنثبّت (إصلاح تلقائي)...');
    return run('npm', ['install']);
  },
  { fatal: true },
);

/* ─────────────── ٢) ESLint --fix ─────────────── */
step('ESLint (--fix) — لوحة الأدمن', () =>
  run('npx', ['next', 'lint', '--fix'], { cwd: join(ROOT, 'apps', 'admin') }),
);
step('ESLint (--fix) — بوابة المعارض', () =>
  run('npx', ['next', 'lint', '--fix'], { cwd: join(ROOT, 'apps', 'dealers') }),
);

/* ─────────────── ٣) الأنواع ─────────────── */
step('TypeScript strict — الأربع حزم', () => run('npm', ['run', 'typecheck']));

/* ─────────────── ٤) اختبارات الوحدات ─────────────── */
step('اختبارات الوحدات — قواعد البيزنس والتنسيق والأمان', () =>
  run('npx', ['vitest', 'run']),
);

/* ─────────────── ٥) الفحوصات الثابتة ─────────────── */
step('الفحوصات الثابتة — الأنماط الممنوعة', () =>
  run('node', [join('scripts', 'static-checks.mjs')]),
);

/* ─────────────── ٦) البناء الإنتاجي ─────────────── */
step('بناء إنتاجي — لوحة الأدمن', () => run('npm', ['run', 'build:admin']));
step('بناء إنتاجي — بوابة المعارض', () => run('npm', ['run', 'build:dealers']));

/* ─────────────── التقرير ─────────────── */
console.log('\n');
line('═');
console.log('  التقرير النهائي');
line('═');
const ICON = { passed: '[نجح]', failed: '[فشل]', skipped: '[اتخطّى]' };
for (const r of results) {
  console.log(`  ${ICON[r.status].padEnd(9)} ${r.name}${r.seconds ? `  (${r.seconds} ث)` : ''}`);
}
line();

const failed = results.filter((r) => r.status === 'failed');
if (failed.length) {
  console.error(`\n${failed.length} خطوة فشلت — راجع الخرج فوق، اصلّح، وشغّل npm run verify تاني.\n`);
  process.exit(1);
}
console.log('\nكل الخطوات عدّت. المشروع جاهز للتسليم — شغّل npm run e2e لاختبار المتصفح.\n');
