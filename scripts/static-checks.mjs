/**
 * ════════════════════════════════════════════════════════════════
 * الفحوصات الثابتة — حارس قواعد المشروع اللي التايب تشيكر مابيشوفهاش
 *
 * بيمشي على كل ملفات المصدر وبيرفض الأنماط الممنوعة بالمواصفات:
 * كل مخالفة بتتطبع بمكانها بالظبط (ملف:سطر) عشان تتصلّح في ثواني.
 * exit code 1 لو فيه أي مخالفة — بيشتغل جوه CI وجوه verify.mjs.
 * ════════════════════════════════════════════════════════════════
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SOURCE_DIRS = ['apps/admin/src', 'apps/dealers/src', 'packages/ui/src', 'packages/api-client/src'];
const PAGE_DIRS = ['apps/admin/src', 'apps/dealers/src'];

/** يمشي على الشجرة ويرجّع ملفات ts/tsx (من غير الاختبارات) */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
const fail = (file, line, rule, detail) =>
  failures.push(`${relative(ROOT, file).split(sep).join('/')}:${line}  [${rule}]  ${detail}`);

/** القواعد — regex لكل سطر + استثناءات */
// ★ (U+2605) رمز مطبعي بتستخدمه المواصفات لتعليم الشاشات المهمة — مش إيموجي
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{26FF}\u{2700}-\u{27BF}]/u;

/** سطر تعليق خالص؟ القواعد اللي بتمنع «الاستخدام» مش «الذِّكر» بتعدّيه */
const isComment = (line) => {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

for (const dirRel of SOURCE_DIRS) {
  const isPageLayer = PAGE_DIRS.includes(dirRel);
  for (const file of walk(join(ROOT, dirRel))) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, i) => {
      const n = i + 1;

      // ١) ممنوع أي إيموجي في المصدر — قرار هوية من الموبايل
      if (EMOJI.test(line)) fail(file, n, 'no-emoji', 'إيموجي في المصدر');

      // ٢) طبقة الصفحات ممنوعة من طبقة الموك — الـhooks هي المسار الوحيد
      if (isPageLayer && /\b(mockDb|MOCK_NOW|getDemoExhibition)\b/.test(line)) {
        fail(file, n, 'no-mock-in-pages', 'استيراد من طبقة الموك جوه صفحة — استخدم hook');
      }

      // ٣) تنقّل داخلي بـwindow.location بيرمي حالة SPA — router.push أو Link
      if (/window\.location\.href\s*=/.test(line)) {
        fail(file, n, 'no-window-nav', 'window.location.href — استخدم router.push أو Link');
      }

      // ٤) الدارك ثيم اتشال نهائيًا — أي أثر ليه غلطة
      if (/data-theme|darkMode|ThemeToggle/.test(line)) {
        fail(file, n, 'no-dark-theme', 'أثر للدارك ثيم — الثيم فاتح بس');
      }

      // ٥) ألوان hex في الصفحات — الألوان من التوكينز بس
      //    (packages/ui مستثنيات: tokens.ts وcharts/theme.ts هما مصدر الألوان)
      if (
        isPageLayer &&
        /#[0-9a-fA-F]{6}\b/.test(line) &&
        !line.trimStart().startsWith('*') &&
        !line.trimStart().startsWith('//')
      ) {
        fail(file, n, 'no-hex-in-pages', 'لون hex مكتوب بالإيد — استخدم توكن من الثيم');
      }

      // ٦) fetch مباشر بيتخطى عميل الـAPI (بترويسات الأمان والـIdempotency)
      if (isPageLayer && /\bfetch\s*\(/.test(line) && !rel.includes('api-client')) {
        fail(file, n, 'no-raw-fetch', 'fetch مباشر — كل النداءات من خلال @carq/api-client');
      }

      // ٧) localStorage للتوكينات ممنوع (§2 · §10) — الاستخدام مش الذِّكر في تعليق
      if (/localStorage|sessionStorage/.test(line) && !isComment(line)) {
        fail(file, n, 'no-web-storage', 'web storage ممنوع — التوكن في الذاكرة بس');
      }

      // ٨) dangerouslySetInnerHTML — باب XSS
      if (/dangerouslySetInnerHTML/.test(line)) {
        fail(file, n, 'no-raw-html', 'dangerouslySetInnerHTML ممنوع');
      }

      // ٩) روابط خارجية من غير noopener
      if (/target="_blank"/.test(line) && !/noopener/.test(line)) {
        fail(file, n, 'blank-noopener', 'target=_blank من غير rel="noopener noreferrer"');
      }
    });

    // ١٠) صفحات العميل بتتعامل مع المزاد لازم مايحسبوش nextBid بالإيد (A-3)
    if (isPageLayer && /nextBid\s*[+\-*]/.test(text) && !/bidStep قيمة معلوماتية/.test(text)) {
      const idx = lines.findIndex((l) => /nextBid\s*[+\-*]/.test(l));
      fail(file, idx + 1, 'server-next-bid', 'حساب nextBid في الواجهة — الرقم بييجي من السيرفر زي ما هو');
    }
  }
}

if (failures.length) {
  console.error(`\nالفحوصات الثابتة لقت ${failures.length} مخالفة:\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('');
  process.exit(1);
} else {
  console.log('الفحوصات الثابتة: نضيفة — ولا مخالفة واحدة.');
}
