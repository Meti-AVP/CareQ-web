/** CarQ UI — نظام التصميم المشترك بين داشبورد الأدمن وبوابة المعارض */

export * from './tokens';
export { cn } from './lib/cn';
export * from './lib/format';
export * from './lib/date';

export { StrokeMotif, type MotifKind } from './components/StrokeMotif';
export { PageHeader, Sheet, SectionHeader } from './components/PageHeader';
export { Ticker } from './components/Ticker';
export { Button, IconButton, type ButtonProps } from './components/Button';
export { StatTile } from './components/StatTile';
export {
  Card,
  InkCard,
  Badge,
  Pill,
  EmptyState,
  ErrorState,
  Skeleton,
  TableSkeleton,
  PulseDot,
  Shine,
  Monogram,
  Banner,
  type Tone,
} from './components/Primitives';
export { DataTable, type Column, type DataTableProps } from './components/DataTable';
export { Dialog, ConfirmDialog } from './components/Dialog';
export {
  Field,
  Input,
  Textarea,
  Select,
  Switch,
  SegmentedControl,
  FileDrop,
} from './components/Form';
export {
  Tabs,
  Countdown,
  ToastProvider,
  useToast,
  ThemeToggle,
  type TabDef,
} from './components/Feedback';

export { ChartFrame, type ChartSeries, type ChartFrameProps } from './charts/ChartFrame';
export {
  TimeSeriesLine,
  VerticalBars,
  HorizontalBars,
  DivergingBars,
  Histogram,
  Funnel,
  ScatterPlot,
  Heatmap,
  StackedShare,
  SparseValues,
  type SeriesDef,
  type FunnelStep,
} from './charts/Charts';
export {
  seriesColor,
  safeColor,
  divergingColor,
  sequentialColor,
  chartVars,
  BAR_RADIUS,
  SLICE_GAP,
} from './charts/theme';
