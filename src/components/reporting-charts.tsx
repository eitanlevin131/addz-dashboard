"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { smsReturnRatio } from "@/lib/report-chart-data";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/metrics";

export const chartColors = { email: "#24282f", sms: "#20b9a8", automation: "#6389d9", cost: "#b77a35", muted: "#dce2e6" };
const compact = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const valid = (value: number) => Number.isFinite(value) ? value : 0;

function ChartFrame({ title, detail, controls, children }: { title: string; detail?: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <section className="report-chart min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white text-[#111318]" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          {detail && <p className="mt-1 text-xs text-[#667085]">{detail}</p>}
        </div>
        {controls}
      </header>
      {children}
    </section>
  );
}

function EmptyChart() {
  return <div className="grid min-h-48 place-content-center gap-2 text-center"><span className="text-3xl text-[#98a2b3]">—</span><p className="text-sm text-[#667085]">אין נתונים בטווח שנבחר</p></div>;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#667085]">{items.map(item => <span key={item.label} className="inline-flex items-center gap-1.5"><i className="size-2 shrink-0 rounded-sm" style={{ background: item.color }} />{item.label}</span>)}</div>;
}

export type RevenueSegment = { label: string; revenue: number; color: string; count: number; purchases: number; cost?: number };

export type PeriodComparisonPoint = {
  date: string;
  label: string;
  email: number;
  sms: number;
  automations: number;
  previousTotal: number;
};

export function PeriodComparisonChart({
  points,
  currency,
  previousRangeLabel,
  onSelect,
}: {
  points: PeriodComparisonPoint[];
  currency: string;
  previousRangeLabel: string;
  onSelect?: (point: PeriodComparisonPoint, series: "email" | "sms" | "automations") => void;
}) {
  const hasData = points.some(
    (point) => point.email || point.sms || point.automations || point.previousTotal,
  );
  const selectPoint = (series: "email" | "sms" | "automations") => (entry: unknown) => {
    const point = (entry as { payload?: PeriodComparisonPoint }).payload;
    if (point) onSelect?.(point, series);
  };

  return (
    <ChartFrame
      title="הכנסות לאורך התקופה"
      detail={`עמודות: התקופה הנוכחית לפי ערוץ · קו: ${previousRangeLabel}`}
      controls={
        <Legend
          items={[
            { label: "אימייל", color: chartColors.email },
            { label: "SMS", color: chartColors.sms },
            { label: "אוטומציות", color: chartColors.automation },
            { label: "תקופה קודמת", color: "#7b8491" },
          ]}
        />
      }
    >
      {!hasData ? (
        <EmptyChart />
      ) : (
        <div
          className="h-[300px] min-w-0 px-2 pb-3 pl-0 sm:h-[340px] sm:px-4 sm:pb-4"
          dir="ltr"
          role="img"
          aria-label="השוואת הכנסות יומית לתקופה הקודמת"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 900, height: 320 }}
          >
            <ComposedChart data={points} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef0f2" />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: "#dfe3e7" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
                tick={{ fill: "#667085", fontSize: 10 }}
              />
              <YAxis
                width={54}
                axisLine={false}
                tickLine={false}
                tickFormatter={compact}
                tick={{ fill: "#667085", fontSize: 10 }}
              />
              <Tooltip
                formatter={(value, name) => [formatCurrency(Number(value), currency), String(name)]}
                contentStyle={{ direction: "rtl", borderRadius: 8, borderColor: "#e4e7ec", fontSize: 12 }}
              />
              <Bar dataKey="email" name="אימייל" stackId="current" fill={chartColors.email} maxBarSize={18} cursor={onSelect ? "pointer" : undefined} onClick={selectPoint("email")} />
              <Bar dataKey="sms" name="SMS" stackId="current" fill={chartColors.sms} maxBarSize={18} cursor={onSelect ? "pointer" : undefined} onClick={selectPoint("sms")} />
              <Bar
                dataKey="automations"
                name="אוטומציות"
                stackId="current"
                fill={chartColors.automation}
                maxBarSize={18}
                cursor={onSelect ? "pointer" : undefined}
                onClick={selectPoint("automations")}
              />
              <Line
                type="monotone"
                dataKey="previousTotal"
                name="תקופה קודמת"
                stroke="#7b8491"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}

export function RevenueShareChart({ title = "מאיפה מגיעות ההכנסות", segments, currency, showCosts = false, onSelect }: { title?: string; segments: RevenueSegment[]; currency: string; showCosts?: boolean; onSelect?: (segment: RevenueSegment) => void }) {
  const total = segments.reduce((sum, row) => sum + valid(row.revenue), 0);
  const hasActivity = segments.some(row => row.count > 0);
  const canDraw = total > 0 && segments.every(row => row.revenue >= 0);
  const chartId = useId();
  const selectSegment = (entry: unknown) => {
    const segment = (entry as { payload?: RevenueSegment }).payload;
    if (segment) onSelect?.(segment);
  };
  return (
    <ChartFrame title={title} detail="הכנסות מדוחות הפעילות · חלק יחסי מהסכום הכולל">
      {!hasActivity ? <EmptyChart /> : <div className="grid min-w-0 items-center gap-2 px-4 pb-4 sm:px-5 xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-6">
        <div className="relative mx-auto h-[228px] w-[228px]" role="img" aria-label={segments.map(row => `${row.label}: ${formatCurrency(row.revenue, currency)}`).join(", ")}>
          <div dir="ltr" className="h-full w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 228, height: 228 }}>
              <PieChart>
                <Pie id={chartId} data={canDraw ? segments : [{ label: "ללא הכנסה חיובית", revenue: 1, color: chartColors.muted }]} dataKey="revenue" nameKey="label" innerRadius={78} outerRadius={103} startAngle={90} endAngle={-270} paddingAngle={canDraw ? 2 : 0} stroke="none" isAnimationActive={false} cursor={onSelect && canDraw ? "pointer" : undefined} onClick={selectSegment}>
                  {(canDraw ? segments : [{ color: chartColors.muted }]).map((row, index) => <Cell key={index} fill={row.color} />)}
                </Pie>
                {canDraw && <Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ direction: "rtl", borderRadius: 8, borderColor: "#e4e7ec", fontSize: 12 }} />}
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-xs text-[#667085]">סך ההכנסות</span>
            <b className="max-w-[154px] break-words text-center text-xl tabular-nums" dir="ltr">{formatCurrency(total, currency)}</b>
          </div>
        </div>
        <div className="min-w-0 divide-y divide-[#eef0f2]">
          {segments.map(row => <button type="button" disabled={!onSelect} onClick={() => onSelect?.(row)} key={row.label} className="block w-full py-3 text-right transition first:pt-0 last:pb-0 enabled:hover:bg-[#f8fbfa] enabled:focus-visible:outline-2 enabled:focus-visible:outline-[#20b9a8] disabled:cursor-default">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 text-sm font-bold"><i className="h-3 w-1 rounded-sm" style={{ background: row.color }} />{row.label}</span>
              <span className="flex items-baseline gap-3"><b className="text-lg tabular-nums" dir="ltr">{formatCurrency(row.revenue, currency)}</b><span className="w-12 text-left text-xs tabular-nums text-[#667085]">{canDraw ? formatPercent(row.revenue / total) : "—"}</span></span>
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-1 pr-3 text-xs text-[#667085]">
              <span>{formatNumber(row.count)} פעילויות · {formatNumber(row.purchases)} רכישות</span>
              {showCosts && <span>{row.cost && row.cost > 0 ? `עלות SMS ${formatCurrency(row.cost, currency)} · ${formatNumberRatio(row.revenue / row.cost)} הכנסה / עלות SMS` : "עלות SMS —"}</span>}
            </div>
          </button>)}
        </div>
      </div>}
    </ChartFrame>
  );
}

function formatNumberRatio(value: number) { return `${value.toFixed(1)}x`; }

export type RankingRow = { id: string; label: string; value: number; color?: string; meta?: string };

export function RankedBars({ title, rows, currency, unit = "הכנסה", detail, controls, limit = 4, onSelect }: { title: string; rows: RankingRow[]; currency?: string; unit?: string; detail?: string; controls?: ReactNode; limit?: number; onSelect?: (row: RankingRow) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, expanded ? sorted.length : limit);
  const max = Math.max(0, ...rows.map(row => valid(row.value)));
  const min = Math.min(0, ...rows.map(row => valid(row.value)));
  const span = max - min || 1;
  const zero = -min / span * 100;
  const format = (value: number) => currency ? formatCurrency(value, currency) : unit === "הכנסה / עלות SMS" ? formatNumberRatio(value) : formatNumber(value);
  return <ChartFrame title={title} detail={detail} controls={controls}>
    {!rows.length ? <EmptyChart /> : <>
      <div className="px-4 pb-4 sm:px-5">
        <div dir="ltr" className="mb-2 flex justify-between border-b border-[#e4e7ec] pb-1 text-[10px] tabular-nums text-[#667085]"><span>{format(min)}</span><span>{unit}</span><span>{format(max)}</span></div>
        <ol className="space-y-4">
          {visible.map((row, i) => <li key={row.id}><button type="button" disabled={!onSelect} onClick={() => onSelect?.(row)} className="block w-full rounded-md text-right transition enabled:hover:bg-[#f8fbfa] enabled:focus-visible:outline-2 enabled:focus-visible:outline-[#20b9a8] disabled:cursor-default">
            <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
              <span className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]"><span className="ml-2 text-[11px] tabular-nums text-[#98a2b3]">{String(i + 1).padStart(2, "0")}</span>{row.label}</span>
              <b className="text-sm tabular-nums" dir="ltr">{format(row.value)}</b>
            </div>
            <div className="relative h-4 overflow-hidden rounded-sm bg-[#f1f4f5]" dir="ltr" aria-hidden="true">
              <div className="absolute inset-y-0 rounded-sm" style={{ left: `${row.value >= 0 ? zero : (row.value - min) / span * 100}%`, width: `${Math.abs(row.value) / span * 100}%`, background: row.value < 0 ? chartColors.cost : row.color ?? chartColors.sms }} />
              {min < 0 && <i className="absolute inset-y-0 w-px bg-[#667085]" style={{ left: `${zero}%` }} />}
            </div>
            {row.meta && <p className="mt-1 text-xs leading-5 text-[#667085]">{row.meta}</p>}
          </button></li>)}
        </ol>
      </div>
      {rows.length > limit && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-[#eef0f2] text-xs font-bold hover:bg-[#f5f8f7]">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? "הצג פחות" : `כל הפעילויות (${rows.length})`}</button>}
    </>}
  </ChartFrame>;
}

export function SmsReturnChart({ groups, currency, onSelect }: { groups: { label: string; revenue: number; cost: number; count: number; comparable: boolean }[]; currency: string; onSelect?: (label: string) => void }) {
  const rows = groups.filter(row => row.count > 0).map(row => ({ ...row, ratio: row.comparable ? smsReturnRatio(row.revenue, row.cost) : null }));
  const max = Math.max(1, ...rows.map(row => row.ratio ?? 0));
  const min = Math.min(0, ...rows.map(row => row.ratio ?? 0));
  const span = max - min;
  const zero = -min / span * 100;
  return <ChartFrame title="כמה הכנסה מתקבלת לכל שקל SMS" detail="הכנסה מיוחסת חלקי עלות SMS">
    {!groups.some(row => row.count > 0) ? <EmptyChart /> : <div className="space-y-6 px-4 pb-4 sm:px-5">
      <div className="flex justify-between border-b border-[#e4e7ec] pb-2 text-xs tabular-nums text-[#667085]" dir="ltr"><span>{formatNumberRatio(min)}</span><span>{formatNumberRatio(max)}</span></div>
      {rows.map(row => <button type="button" disabled={!onSelect} onClick={() => onSelect?.(row.label)} key={row.label} className="block w-full rounded-md text-right transition enabled:hover:bg-[#f8fbfa] enabled:focus-visible:outline-2 enabled:focus-visible:outline-[#20b9a8] disabled:cursor-default">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold">{row.label}</h3>
          {row.comparable ? <b className="text-3xl tabular-nums" dir="ltr">{row.ratio !== null ? formatNumberRatio(row.ratio) : "—"}</b> : <span className="text-xs text-[#667085]">אימייל + SMS</span>}
        </div>
        {row.comparable && <div className="relative h-7 rounded-sm bg-[#f1f4f5]" dir="ltr" role="img" aria-label={row.ratio === null ? "אין עלות SMS לחישוב יחס" : `${row.ratio.toFixed(2)} הכנסה לכל שקל עלות SMS`}>
          {row.ratio !== null && <div className="absolute inset-y-0 rounded-sm" style={{ left: `${row.ratio >= 0 ? zero : (row.ratio - min) / span * 100}%`, width: `${Math.abs(row.ratio) / span * 100}%`, background: row.ratio < 1 ? chartColors.cost : chartColors.sms }} />}
          <i className="absolute inset-y-0 border-l border-dashed border-[#475467]" style={{ left: `${(1 - min) / span * 100}%` }} />
        </div>}
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[#667085]">
          <span>הכנסה <b className="font-medium text-[#24282f]">{formatCurrency(row.revenue, currency)}</b></span>
          <span>עלות SMS <b className="font-medium text-[#24282f]">{formatCurrency(row.cost, currency)}</b></span>
        </div>
        {row.comparable && row.ratio === null && <p className="mt-2 text-xs text-[#667085]">אין עלות SMS לחישוב יחס</p>}
      </button>)}
      <div className="space-y-1 border-t border-[#eef0f2] pt-3 text-[11px] text-[#667085]">
        <p>הקו המקווקו: הכנסה של ₪1 לכל ₪1 בעלות SMS.</p>
        <p>אוטומציות מעורבות אינן נכללות בהשוואת ההחזר: ההכנסה כוללת גם אימייל.</p>
      </div>
    </div>}
  </ChartFrame>;
}

export function EngagementPlot({ rows, onSelect }: { rows: { id: string; label: string; opens: number | null; clicks: number | null; revenue: number; currency: string }[]; onSelect?: (id: string) => void }) {
  const maximum = Math.max(1, ...rows.flatMap(row => [row.opens ?? 0, row.clicks ?? 0]));
  return <ChartFrame title="שורות נושא · פתיחה מול הקלקה" detail="קמפייני האימייל המובילים בהכנסה · מתוך הודעות שנמסרו" controls={<Legend items={[{ label: "פתיחה", color: chartColors.email }, { label: "הקלקה", color: chartColors.sms }]} />}>
    {!rows.length ? <EmptyChart /> : <div className="px-4 pb-4 sm:px-5">
      <div dir="ltr" className="mb-3 flex justify-between text-[10px] text-[#98a2b3]"><span>0%</span><span>{formatPercent(maximum / 2)}</span><span>{formatPercent(maximum)}</span></div>
      <ol className="space-y-5">{rows.slice(0, 4).map(row => {
        const a = row.opens === null ? null : row.opens / maximum * 100;
        const b = row.clicks === null ? null : row.clicks / maximum * 100;
        return <li key={row.id}><button type="button" disabled={!onSelect} onClick={() => onSelect?.(row.id)} className="block w-full rounded-md text-right transition enabled:hover:bg-[#f8fbfa] enabled:focus-visible:outline-2 enabled:focus-visible:outline-[#20b9a8] disabled:cursor-default">
          <p className="text-sm leading-5 [overflow-wrap:anywhere]">{row.label}</p>
          <div dir="ltr" className="relative mx-1.5 my-3 h-3" aria-hidden="true">
            <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-[#edf0f2]" />
            {a !== null && b !== null && <div className="absolute top-1 h-1 bg-[#ccd8d7]" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} />}
            {a !== null && <i className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-white" style={{ left: `${a}%`, background: chartColors.email }} />}
            {b !== null && <i className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-white" style={{ left: `${b}%`, background: chartColors.sms }} />}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[11px] tabular-nums text-[#667085]"><span>פתיחה <b className="text-[#24282f]">{row.opens === null ? "—" : formatPercent(row.opens)}</b> · הקלקה <b className="text-[#078575]">{row.clicks === null ? "—" : formatPercent(row.clicks)}</b></span><span>{formatCurrency(row.revenue, row.currency)}</span></div>
        </button></li>;
      })}</ol>
    </div>}
  </ChartFrame>;
}

export function WeekdayBars({ groups, currency, timezone, onSelect }: { groups: { label: string; revenue: number; count: number }[]; currency: string; timezone: string; onSelect?: (label: string) => void }) {
  const [average, setAverage] = useState(true);
  const data = groups.map(row => ({ ...row, value: row.count > 0 ? (average ? row.revenue / row.count : row.revenue) : null }));
  const max = Math.max(0, ...data.map(row => row.value ?? 0));
  const min = Math.min(0, ...data.map(row => row.value ?? 0));
  const span = max - min || 1;
  const baseline = max / span * 180;
  return <ChartFrame title="ביצועים לפי יום שליחה" detail={`שיוך לפי מועד השליחה · ${timezone}`} controls={<div className="flex rounded-md bg-[#f1f4f5] p-0.5" role="group" aria-label="מדד ליום שליחה">{[{ value: true, label: "ממוצע לקמפיין" }, { value: false, label: "סך הכנסה" }].map(option => <button key={option.label} aria-pressed={average === option.value} onClick={() => setAverage(option.value)} className={`min-h-8 rounded px-2 text-xs ${average === option.value ? "bg-white font-bold shadow-sm" : "text-[#667085]"}`}>{option.label}</button>)}</div>}>
    {!groups.some(row => row.count > 0) ? <EmptyChart /> : <div className="px-4 pb-4 sm:px-5">
      <div className="flex justify-between text-[10px] text-[#667085]"><span>{average ? "הכנסה ממוצעת לקמפיין" : "הכנסה"}</span><span>{currency}</span></div>
      <div className="mt-4 grid h-[220px] grid-cols-7 gap-1 border-b border-[#e4e7ec] sm:gap-3" role="img" aria-label={data.map(row => `${row.label}: ${row.value === null ? "לא נשלחו קמפיינים" : formatCurrency(row.value, currency)}`).join(", ")}>
        {data.map(row => <button type="button" disabled={!onSelect || row.count === 0} onClick={() => onSelect?.(row.label)} key={row.label} className="relative min-w-0 rounded-sm enabled:cursor-pointer enabled:hover:bg-[#f8fbfa] enabled:focus-visible:outline-2 enabled:focus-visible:outline-[#20b9a8] disabled:cursor-default" title={`${row.label}: ${row.value === null ? "—" : formatCurrency(row.value, currency)} · ${row.count} קמפיינים`}>
          <b className="absolute inset-x-0 text-center text-[10px] tabular-nums sm:text-xs" style={{ top: `${20 + (max - Math.max(0, row.value ?? 0)) / span * 180 - 20}px` }}>{row.value === null ? "—" : compact(row.value)}</b>
          <div className="absolute left-1/2 w-full max-w-10 -translate-x-1/2 rounded-sm" style={{ top: `${20 + (max - Math.max(0, row.value ?? 0)) / span * 180}px`, height: `${Math.abs(row.value ?? 0) / span * 180}px`, background: (row.value ?? 0) < 0 ? chartColors.cost : row.value === max && max > 0 ? chartColors.sms : "#b7c9c6" }} />
          {min < 0 && <div className="absolute inset-x-0 border-t border-[#98a2b3]" style={{ top: `${20 + baseline}px` }} />}
        </button>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">{data.map(row => <div key={row.label}><b>{row.label}</b><p className="mt-1 text-[10px] tabular-nums text-[#667085]">{row.count || "—"}</p></div>)}</div>
      <p className="mt-3 text-[11px] text-[#667085]">מספר קמפיינים</p>
    </div>}
  </ChartFrame>;
}
