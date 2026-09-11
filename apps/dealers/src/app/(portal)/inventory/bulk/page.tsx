'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Download,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  FileDrop,
  PageHeader,
  SectionHeader,
  Select,
  Sheet,
  useToast,
  formatEGP,
  withThousands,
  type Column,
} from '@carq/ui';
import { errorMessage, useBulkCreate, useMyListings } from '@carq/api-client';
import {
  AREAS_BY_GOV,
  BODIES,
  COLORS,
  GOVERNORATES,
  MAKES,
  MODELS_BY_MAKE,
  TRANSMISSIONS,
  resolveFrom,
  westernDigits,
} from '@/lib/catalog';

/**
 * ════════════════════════════════════════════════════════════════
 * `/inventory/bulk` — الرفع بالجملة (EXHIBITION_PORTAL_SPEC §4.3)
 *
 * المعرض عنده ٤٠ عربية. مستحيل يدخّلهم واحدة واحدة — ده الفرق بين
 * بوابة بتتستخدم وبوابة بتتقفل بعد يوم.
 *
 * أربع خطوات، والتحقق كله **قبل أي إرسال**:
 *  ١) قالب CSV بـBOM عشان إكسل يفتح العربي صح
 *  ٢) رفع وقراءة محلية بالـFileReader
 *  ٣) معاينة بتحقق: الكتالوج · حدود L-3 · المحافظة · تكرار L-12
 *  ٤) إرسال بمفتاح Idempotency مستقل لكل صف (X-3)
 * ════════════════════════════════════════════════════════════════
 */

const COLUMNS = [
  'make',
  'model',
  'year',
  'price',
  'km',
  'transmission',
  'body',
  'color',
  'governorate',
  'area',
  'description',
] as const;

type ColumnKey = (typeof COLUMNS)[number];

/** حدود L-3 — نفس أرقام السيرفر بالظبط */
const PRICE_MIN = 10_000;
const PRICE_MAX = 100_000_000;
const YEAR_MIN = 1950;
const YEAR_MAX = new Date().getFullYear() + 1;
const KM_MIN = 0;
const KM_MAX = 2_000_000;
/** L-12: فرق العداد اللي تحته الإعلان بيعتبر تكرار محتمل */
const DUP_KM_WINDOW = 2_000;

type IssueLevel = 'error' | 'warn';
interface Issue {
  level: IssueLevel;
  text: string;
}

interface Row {
  index: number;
  make: string | null;
  makeRaw: string;
  model: string | null;
  modelRaw: string;
  year: number | null;
  price: number | null;
  km: number | null;
  transmission: string;
  body: string;
  color: string;
  governorate: string | null;
  governorateRaw: string;
  area: string;
  description: string;
}

type SendState = 'sending' | 'ok' | 'fail';
interface RowResult {
  state: SendState;
  error?: string;
}

/* ═══════════════════════ قراءة الـCSV ═══════════════════════ */

/**
 * parse بسيط بيحترم الاقتباسات: الفاصلة جوه `"…"` مش فاصل حقول،
 * و`""` جوه الاقتباس معناها علامة اقتباس واحدة.
 */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toNumber(raw: string): number | null {
  const cleaned = westernDigits(raw).replace(/[,\s٬]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function buildTemplate(): string {
  const make = MAKES[0] ?? 'تويوتا';
  const model = MODELS_BY_MAKE[make]?.[0] ?? 'كورولا';
  const gov = GOVERNORATES[0] ?? 'القاهرة';
  const area = AREAS_BY_GOV[gov]?.[0] ?? '';
  const sample = [
    make,
    model,
    '2021',
    '740000',
    '62000',
    TRANSMISSIONS[0],
    BODIES[0] ?? 'سيدان',
    COLORS[0] ?? 'أبيض',
    gov,
    area,
    'فابريكا بالكامل والصيانات بالتوكيل',
  ];
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [COLUMNS.join(','), sample.map(esc).join(',')].join('\n');
}

/* ═══════════════════════ الشاشة ═══════════════════════ */

const STEPS = [
  { key: 'template', label: 'نزّل القالب', icon: Download },
  { key: 'upload', label: 'ارفع الملف', icon: Upload },
  { key: 'review', label: 'راجع وصلّح', icon: CheckCircle2 },
  { key: 'send', label: 'ابعت', icon: Send },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export default function BulkUploadPage() {
  const toast = useToast();
  const [step, setStep] = useState<StepKey>('template');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const uploadIdRef = useRef<string>('');

  const myListings = useMyListings();
  const bulk = useBulkCreate();

  /* ── الخطوة ١: القالب ── */
  const downloadTemplate = () => {
    // BOM إجباري — من غيره إكسل بيفتح العربي حروف مكسّرة
    const blob = new Blob([`﻿${buildTemplate()}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carq-bulk-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    setStep('upload');
  };

  /* ── الخطوة ٢: القراءة ── */
  const onPick = useCallback((file: File) => {
    setFileName(file.name);
    setParseError(null);
    setResults({});
    setFinished(false);
    const reader = new FileReader();
    reader.onerror = () => setParseError('مقدرناش نقرا الملف. جرّب تحفظه CSV تاني وارفعه.');
    reader.onload = () => {
      const table = parseCsv(String(reader.result ?? ''));
      if (table.length < 2) {
        setRows([]);
        setParseError('الملف فاضي أو فيه سطر العناوين بس. نزّل القالب واملاه.');
        return;
      }
      const header = table[0]!.map((h) => h.trim().toLowerCase());
      const missing = COLUMNS.filter((c) => !header.includes(c));
      if (missing.length) {
        setRows([]);
        setParseError(
          `في أعمدة ناقصة في الملف: ${missing.join(' · ')}. نزّل القالب واستخدمه زي ما هو.`,
        );
        return;
      }
      const at = (cells: string[], key: ColumnKey) => (cells[header.indexOf(key)] ?? '').trim();

      const parsed: Row[] = table.slice(1).map((cells, i) => {
        const makeRaw = at(cells, 'make');
        const modelRaw = at(cells, 'model');
        const govRaw = at(cells, 'governorate');
        const make = resolveFrom(MAKES, makeRaw);
        return {
          index: i,
          makeRaw,
          make,
          modelRaw,
          model: make ? resolveFrom(MODELS_BY_MAKE[make] ?? [], modelRaw) : null,
          year: toNumber(at(cells, 'year')),
          price: toNumber(at(cells, 'price')),
          km: toNumber(at(cells, 'km')),
          transmission: at(cells, 'transmission'),
          body: at(cells, 'body'),
          color: at(cells, 'color'),
          governorateRaw: govRaw,
          governorate: resolveFrom(GOVERNORATES, govRaw),
          area: at(cells, 'area'),
          description: at(cells, 'description'),
        };
      });
      setRows(parsed);
      setStep('review');
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  /* ── الخطوة ٣: التحقق ── */
  const activeMine = useMemo(
    () => (myListings.data ?? []).filter((l) => l.status === 'active' || l.status === 'reserved'),
    [myListings.data],
  );

  const issuesByRow = useMemo(() => {
    const map = new Map<number, Issue[]>();
    for (const r of rows) {
      const list: Issue[] = [];

      if (!r.makeRaw) list.push({ level: 'error', text: 'الماركة فاضية' });
      else if (!r.make)
        list.push({ level: 'warn', text: `«${r.makeRaw}» مش في الكتالوج — اختار الماركة` });

      if (!r.modelRaw) list.push({ level: 'error', text: 'الموديل فاضي' });
      else if (r.make && !r.model)
        list.push({
          level: 'warn',
          text: `«${r.modelRaw}» مش موديل معروف للماركة دي — اختار الموديل`,
        });

      if (r.year === null) list.push({ level: 'error', text: 'السنة مش رقم' });
      else if (r.year < YEAR_MIN || r.year > YEAR_MAX)
        list.push({ level: 'error', text: `السنة لازم بين ${YEAR_MIN} و${YEAR_MAX}` });

      if (r.price === null) list.push({ level: 'error', text: 'السعر مش رقم' });
      else if (r.price < PRICE_MIN || r.price > PRICE_MAX)
        list.push({
          level: 'error',
          text: `السعر لازم بين ${withThousands(PRICE_MIN)} و${withThousands(PRICE_MAX)} ج.م`,
        });

      if (r.km === null) list.push({ level: 'error', text: 'العداد مش رقم' });
      else if (r.km < KM_MIN || r.km > KM_MAX)
        list.push({
          level: 'error',
          text: `العداد لازم بين ${withThousands(KM_MIN)} و${withThousands(KM_MAX)} كم`,
        });

      if (!r.governorateRaw) list.push({ level: 'error', text: 'المحافظة فاضية' });
      else if (!r.governorate)
        list.push({ level: 'warn', text: `«${r.governorateRaw}» مش محافظة معروفة — اختار المحافظة` });

      // L-12: تكرار محتمل مع إعلان نشط عندك
      if (r.make && r.model && r.year !== null && r.km !== null) {
        const km = r.km;
        const twin = activeMine.find(
          (l) =>
            l.make === r.make &&
            l.model === r.model &&
            l.year === r.year &&
            Math.abs(l.km - km) <= DUP_KM_WINDOW,
        );
        if (twin)
          list.push({
            level: 'warn',
            text: `شبه إعلان نشط عندك: ${twin.title} ${twin.year} · ${withThousands(twin.km)} كم`,
          });
      }

      // تكرار جوه نفس الملف
      const twinInFile = rows.find(
        (o) =>
          o.index < r.index &&
          o.make !== null &&
          o.make === r.make &&
          o.model === r.model &&
          o.year === r.year &&
          o.km !== null &&
          r.km !== null &&
          Math.abs(o.km - r.km) <= DUP_KM_WINDOW,
      );
      if (twinInFile)
        list.push({
          level: 'warn',
          text: `متكرر مع الصف رقم ${twinInFile.index + 1} في نفس الملف`,
        });

      map.set(r.index, list);
    }
    return map;
  }, [rows, activeMine]);

  const rowReady = useCallback(
    (r: Row) => {
      const list = issuesByRow.get(r.index) ?? [];
      if (list.some((i) => i.level === 'error')) return false;
      return Boolean(r.make && r.model && r.governorate);
    },
    [issuesByRow],
  );

  const readyRows = useMemo(() => rows.filter(rowReady), [rows, rowReady]);
  const blockedCount = rows.length - readyRows.length;
  const warnCount = useMemo(
    () =>
      readyRows.filter((r) => (issuesByRow.get(r.index) ?? []).some((i) => i.level === 'warn'))
        .length,
    [readyRows, issuesByRow],
  );

  const patchRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...patch } : r)));

  /* ── الخطوة ٤: الإرسال ── */
  const send = async () => {
    if (!readyRows.length) return;
    const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    uploadIdRef.current = uploadId;
    setSending(true);
    setFinished(false);
    setStep('send');
    setResults(
      Object.fromEntries(readyRows.map((r) => [r.index, { state: 'sending' as SendState }])),
    );

    const order = readyRows.map((r) => r.index);
    const payload = readyRows.map((r) => ({
      make: r.make,
      model: r.model,
      year: r.year,
      price: r.price,
      km: r.km,
      transmission: r.transmission,
      body: r.body,
      color: r.color,
      governorate: r.governorate,
      area: r.area,
      description: r.description,
    }));

    try {
      await bulk.mutateAsync({
        rows: payload,
        uploadId,
        onProgress: (i, ok, error) => {
          const rowIndex = order[i];
          setResults((prev) => ({
            ...prev,
            [rowIndex]: ok ? { state: 'ok' } : { state: 'fail', error },
          }));
        },
      });
      setFinished(true);
      toast({ title: 'الرفع خلص', body: 'راجع التقرير تحت — كل صف وحالته.', tone: 'ok' });
    } catch (e) {
      toast({ title: 'الرفع وقف', body: errorMessage(e), tone: 'crit' });
    } finally {
      setSending(false);
    }
  };

  const sentOk = Object.values(results).filter((r) => r.state === 'ok').length;
  const sentFail = Object.values(results).filter((r) => r.state === 'fail').length;
  const sentTotal = Object.keys(results).length;
  const progressPct = sentTotal ? Math.round(((sentOk + sentFail) / sentTotal) * 100) : 0;

  const reset = () => {
    setRows([]);
    setResults({});
    setFileName(null);
    setParseError(null);
    setFinished(false);
    setStep('upload');
  };

  /* ── أعمدة الجدول ── */
  const columns: Array<Column<Row>> = [
    {
      key: 'index',
      header: 'الصف',
      width: 64,
      align: 'center',
      value: (r) => r.index + 1,
      render: (r) => <span className="tnum text-caption text-content-sub">{r.index + 1}</span>,
    },
    {
      key: 'make',
      header: 'الماركة',
      width: 168,
      value: (r) => r.make ?? r.makeRaw,
      render: (r) =>
        r.make ? (
          <span className="text-sub font-bold text-content">{r.make}</span>
        ) : (
          <Select
            aria-label="اختار الماركة"
            invalid
            className="h-9 text-caption"
            value=""
            onChange={(e) => {
              const make = e.target.value;
              patchRow(r.index, {
                make,
                model: resolveFrom(MODELS_BY_MAKE[make] ?? [], r.modelRaw),
              });
            }}
          >
            <option value="">{r.makeRaw || 'اختار الماركة'}</option>
            {MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        ),
    },
    {
      key: 'model',
      header: 'الموديل',
      width: 178,
      value: (r) => r.model ?? r.modelRaw,
      render: (r) =>
        r.model ? (
          <span className="text-sub text-content">{r.model}</span>
        ) : (
          <Select
            aria-label="اختار الموديل"
            invalid
            className="h-9 text-caption"
            value=""
            disabled={!r.make}
            onChange={(e) => patchRow(r.index, { model: e.target.value })}
          >
            <option value="">{r.modelRaw || 'اختار الموديل'}</option>
            {(r.make ? (MODELS_BY_MAKE[r.make] ?? []) : []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        ),
    },
    {
      key: 'year',
      header: 'السنة',
      width: 76,
      align: 'center',
      value: (r) => r.year ?? '',
      render: (r) => <span className="tnum text-sub text-content">{r.year ?? '—'}</span>,
      hideBelow: 'md',
    },
    {
      key: 'price',
      header: 'السعر',
      width: 130,
      value: (r) => r.price ?? '',
      render: (r) => (
        <span className="tnum text-sub text-content">
          {r.price === null ? '—' : formatEGP(r.price)}
        </span>
      ),
    },
    {
      key: 'km',
      header: 'العداد',
      width: 108,
      value: (r) => r.km ?? '',
      render: (r) => (
        <span className="tnum text-sub text-content-sub">
          {r.km === null ? '—' : `${withThousands(r.km)} كم`}
        </span>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'governorate',
      header: 'المحافظة',
      width: 160,
      value: (r) => r.governorate ?? r.governorateRaw,
      render: (r) =>
        r.governorate ? (
          <span className="text-sub text-content-sub">{r.governorate}</span>
        ) : (
          <Select
            aria-label="اختار المحافظة"
            invalid
            className="h-9 text-caption"
            value=""
            onChange={(e) => patchRow(r.index, { governorate: e.target.value })}
          >
            <option value="">{r.governorateRaw || 'اختار المحافظة'}</option>
            {GOVERNORATES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        ),
      hideBelow: 'lg',
    },
    {
      key: 'state',
      header: 'الحالة',
      value: (r) => {
        const res = results[r.index];
        if (res) return res.state;
        return rowReady(r) ? 'سليم' : 'محتاج مراجعة';
      },
      render: (r) => {
        const res = results[r.index];
        const list = issuesByRow.get(r.index) ?? [];
        if (res) {
          if (res.state === 'sending')
            return (
              <Badge tone="neutral" icon={<Loader2 className="animate-spin" />}>
                بيتبعت
              </Badge>
            );
          if (res.state === 'ok')
            return (
              <Badge tone="ok" icon={<Check />}>
                اتنشر
              </Badge>
            );
          return (
            <div className="space-y-1">
              <Badge tone="crit" icon={<X />}>
                فشل
              </Badge>
              <p className="text-caption text-crit">{res.error ?? 'السيرفر رفض الصف'}</p>
            </div>
          );
        }
        if (!list.length)
          return (
            <Badge tone="ok" icon={<Check />}>
              سليم
            </Badge>
          );
        const hasError = list.some((i) => i.level === 'error');
        return (
          <div className="space-y-1">
            <Badge tone={hasError ? 'crit' : 'warn'} icon={<AlertTriangle />}>
              {hasError ? 'مرفوض قبل الإرسال' : 'محتاج مراجعة'}
            </Badge>
            <ul className="space-y-0.5">
              {list.map((i, k) => (
                <li
                  key={k}
                  className={
                    i.level === 'error' ? 'text-caption text-crit' : 'text-caption text-warn'
                  }
                >
                  {i.text}
                </li>
              ))}
            </ul>
          </div>
        );
      },
    },
  ];

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <>
      <PageHeader
        title="رفع بالجملة"
        subtitle="أربعين عربية في رفعة واحدة — تحقق كامل قبل ما يتبعت ولا صف"
        motif="underline"
        actions={
          <Link href="/inventory">
            <Button variant="white" size="sm" iconEnd={<ArrowLeft />}>
              عربياتي
            </Button>
          </Link>
        }
      >
        {/* الـstepper جوه الرأس — بيفضل ظاهر في كل الخطوات */}
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (i <= stepIndex) setStep(s.key);
                  }}
                  disabled={i > stepIndex}
                  className={[
                    'flex items-center gap-2 rounded-full px-3.5 py-2 text-sub font-bold transition-colors',
                    active
                      ? 'bg-white text-ink'
                      : done
                        ? 'bg-white/15 text-white'
                        : 'bg-white/5 text-white/40',
                  ].join(' ')}
                >
                  <span className="tnum inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink/15 text-[11px]">
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 ? <span className="h-px w-4 bg-white/20" /> : null}
              </li>
            );
          })}
        </ol>
      </PageHeader>

      <Sheet>
        {/* ───── قاعدة X-3: مفتاح مستقل لكل صف ───── */}
        <Banner
          tone="accent"
          icon={<KeyRound />}
          title="كل صف بيتبعت بمفتاح Idempotency مستقل"
          className="mb-6 animate-rise"
        >
          المفتاح شكله: bulk ثم uploadId ثم rowIndex. من غيره، لو الشبكة اتقطعت في نص الرفع
          وأعدت المحاولة، العربيات هتتنشر مرتين — نفس العربية بإعلانين مختلفين عند نفس المعرض.
        </Banner>

        {/* ───── الخطوة ١ ───── */}
        {step === 'template' ? (
          <Card className="animate-rise">
            <SectionHeader
              title="١. نزّل القالب"
              hint="أحد عشر عمود بالترتيب ده بالظبط — الملف بيتحفظ بـBOM عشان إكسل يفتح العربي صح"
            />
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="text-body text-content-sub">
                  افتح القالب في إكسل أو جوجل شيتس، املا صف لكل عربية، واحفظه CSV تاني. الأعمدة
                  كلها مطلوبة حتى لو بعضها فاضي — الترتيب هو اللي بنقرا بيه.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button icon={<Download />} onClick={downloadTemplate}>
                    نزّل قالب CSV
                  </Button>
                  <Button variant="outline" onClick={() => setStep('upload')} iconEnd={<ArrowLeft />}>
                    عندي الملف جاهز
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-line bg-surface-alt p-4">
                <p className="mb-2 text-caption font-bold text-content-sub">أعمدة القالب</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {COLUMNS.map((c) => (
                    <li key={c} className="flex items-center gap-2 text-caption text-content">
                      <Copy className="h-3 w-3 shrink-0 text-content-faint" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ) : null}

        {/* ───── الخطوة ٢ ───── */}
        {step === 'upload' ? (
          <Card className="animate-rise">
            <SectionHeader
              title="٢. ارفع الملف"
              hint="بنقرا الملف على جهازك — ولا صف بيوصل السيرفر قبل ما تراجع المعاينة"
            />
            <FileDrop
              label="اسحب ملف CSV هنا أو دوس للاختيار"
              hint="ملف CSV بالأعمدة اللي في القالب"
              accept=".csv,text/csv"
              fileName={fileName}
              icon={<FileSpreadsheet />}
              invalid={Boolean(parseError)}
              onPick={onPick}
            />
            {parseError ? (
              <p className="mt-3 flex items-start gap-2 text-sub font-bold text-crit">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {parseError}
              </p>
            ) : null}
            <div className="mt-4">
              <Button variant="ghost" size="sm" onClick={() => setStep('template')}>
                رجوع للقالب
              </Button>
            </div>
          </Card>
        ) : null}

        {/* ───── الخطوة ٣ و٤: نفس الجدول ───── */}
        {step === 'review' || step === 'send' ? (
          <>
            <SectionHeader
              title={step === 'review' ? '٣. راجع وصلّح' : '٤. الإرسال والتقرير'}
              hint={
                step === 'review'
                  ? 'الصف الأحمر مابيتبعتش خالص. الصف الأصفر بيتبعت بعد ما تختار القيمة الصح.'
                  : 'كل صف وحالته — والفشل بسببه مكتوب جنبه'
              }
              action={
                step === 'review' ? (
                  <Button variant="ghost" size="sm" onClick={reset}>
                    ارفع ملف تاني
                  </Button>
                ) : null
              }
            />

            {/* عدّاد فوق الجدول */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card padded={false} className="px-4 py-3">
                <p className="text-caption text-content-sub">صفوف الملف</p>
                <p className="tnum mt-1 text-h2 text-content">{withThousands(rows.length)}</p>
              </Card>
              <Card padded={false} className="border-ok/30 px-4 py-3">
                <p className="text-caption text-content-sub">جاهز للإرسال</p>
                <p className="tnum mt-1 text-h2 text-ok">{withThousands(readyRows.length)}</p>
              </Card>
              <Card padded={false} className="border-warn/30 px-4 py-3">
                <p className="text-caption text-content-sub">فيه تنبيه</p>
                <p className="tnum mt-1 text-h2 text-warn">{withThousands(warnCount)}</p>
              </Card>
              <Card padded={false} className="border-crit/30 px-4 py-3">
                <p className="text-caption text-content-sub">مرفوض قبل الإرسال</p>
                <p className="tnum mt-1 text-h2 text-crit">{withThousands(blockedCount)}</p>
              </Card>
            </div>

            {/* شريط التقدّم — بيظهر وقت الإرسال بس */}
            {sentTotal > 0 ? (
              <Card className="mb-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-title text-content">
                    {finished ? 'التقرير النهائي' : 'بيتبعت دلوقتي…'}
                  </p>
                  <p className="tnum text-sub text-content-sub">
                    {withThousands(sentOk + sentFail)} من {withThousands(sentTotal)}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted-soft">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="ok" icon={<CheckCircle2 />}>
                    نجح {withThousands(sentOk)}
                  </Badge>
                  <Badge
                    tone={sentFail ? 'crit' : 'neutral'}
                    icon={sentFail ? <X /> : <CircleDashed />}
                  >
                    فشل {withThousands(sentFail)}
                  </Badge>
                  {finished ? (
                    <Badge tone="neutral" icon={<KeyRound />}>
                      المفتاح: bulk-{uploadIdRef.current}-رقم الصف
                    </Badge>
                  ) : null}
                </div>
                {finished && sentFail > 0 ? (
                  <p className="mt-3 text-sub text-content-sub">
                    الصفوف اللي فشلت متعلّمة في الجدول بسببها. صلّحها وابعتها لوحدها — الصفوف اللي
                    نجحت مش هتتنشر تاني لأن مفتاحها اتسجّل عند السيرفر.
                  </p>
                ) : null}
              </Card>
            ) : null}

            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => String(r.index)}
              loading={myListings.isLoading && rows.length === 0}
              error={myListings.error ? errorMessage(myListings.error) : undefined}
              onRetry={() => myListings.refetch()}
              emptyTitle="مفيش صفوف"
              emptyHint="ارفع ملف CSV بالأعمدة اللي في القالب."
              emptyAction={
                <Button variant="outline" size="sm" icon={<Upload />} onClick={reset}>
                  ارفع ملف
                </Button>
              }
              searchable
              searchPlaceholder="دوّر في صفوف الملف…"
              exportName="carq-bulk-review"
              rowTone={(r) => {
                const res = results[r.index];
                if (res?.state === 'fail') return 'crit';
                if (res) return undefined;
                if (!rowReady(r)) return 'crit';
                return (issuesByRow.get(r.index) ?? []).length ? 'warn' : undefined;
              }}
            />

            {/* زرار الإرسال */}
            <Card className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-title text-content">
                    {finished
                      ? `اتنشر ${withThousands(sentOk)} إعلان`
                      : `هيتبعت ${withThousands(readyRows.length)} صف`}
                  </p>
                  <p className="mt-1 text-sub text-content-sub">
                    {blockedCount > 0
                      ? `${withThousands(blockedCount)} صف مش هيتبعت لحد ما يتصلّح — الأحمر في الجدول.`
                      : 'كل الصفوف عدّت التحقق. الإعلان بيتنشر مسودة لحد ما ترفع أول صورة.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {finished ? (
                    <>
                      <Link href="/inventory">
                        <Button icon={<Boxes />}>روح لعربياتي</Button>
                      </Link>
                      <Button variant="outline" onClick={reset} icon={<Upload />}>
                        ارفع ملف تاني
                      </Button>
                    </>
                  ) : (
                    <Button
                      icon={<Send />}
                      onClick={send}
                      loading={sending}
                      disabled={readyRows.length === 0}
                    >
                      ابعت {withThousands(readyRows.length)} عربية
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
