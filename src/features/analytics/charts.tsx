import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import type { ExamPoint, WeekPoint } from './analyticsHelpers';

const AXIS = { fill: 'rgb(var(--muted))', fontSize: 11 };
const GRID = 'rgb(var(--border))';
const TIP = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 8, color: 'rgb(var(--fg))', fontSize: 12 };

/** Card + accessible figure: a text summary for screen readers and a visually hidden data table with the same numbers. */
export function ChartFrame({ title, description, summary, columns, rows, empty, emptyText, height = 240, children }: {
  title: string; description?: string; summary: string; columns: string[]; rows: (string | number)[][];
  empty: boolean; emptyText: string; height?: number; children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} as="h3" />
      <CardBody>
        {empty ? (
          <p className="flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted" style={{ minHeight: 120 }}>{emptyText}</p>
        ) : (
          <figure>
            <div style={{ height }} role="img" aria-label={`${title}. ${summary}`}>{children}</div>
            <figcaption className="sr-only">{summary}</figcaption>
            <table className="sr-only">
              <caption>{title} (data)</caption>
              <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>)}</tbody>
            </table>
          </figure>
        )}
      </CardBody>
    </Card>
  );
}

export function DailyMinutesChart({ data }: { data: { date: string; minutes: number }[] }) {
  const total = data.reduce((a, d) => a + d.minutes, 0);
  const active = data.filter((d) => d.minutes > 0).length;
  const rows = data.map((d) => ({ ...d, label: d.date.slice(5).replace('-', '/') }));
  return (
    <ChartFrame title="Daily study minutes" description="Last 14 days of independent study" empty={total === 0} emptyText="No study time recorded in the last 14 days yet."
      summary={`${total} minutes over the last 14 days, on ${active} of 14 days.`} columns={['Date', 'Minutes']} rows={data.map((d) => [d.date, d.minutes])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <RTooltip contentStyle={TIP} formatter={(v: number) => [`${v} min`, 'Studied']} cursor={{ fill: 'rgb(var(--surface-2))' }} />
          <Bar dataKey="minutes" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function WeeklyMinutesChart({ data }: { data: WeekPoint[] }) {
  const total = data.reduce((a, d) => a + d.minutes, 0);
  return (
    <ChartFrame title="Weekly study minutes" description="Last 8 weeks (weeks start Monday)" empty={total === 0} emptyText="No study time recorded in the last 8 weeks yet."
      summary={`${total} minutes over 8 weeks. This week: ${data[data.length - 1]?.minutes ?? 0} minutes.`} columns={['Week starting', 'Minutes']} rows={data.map((d) => [d.weekStart, d.minutes])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <RTooltip contentStyle={TIP} formatter={(v: number) => [`${v} min`, 'Studied']} labelFormatter={(l) => `Week of ${l}`} cursor={{ fill: 'rgb(var(--surface-2))' }} />
          <Bar dataKey="minutes" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function AccuracyTrendChart({ data, target }: { data: { date: string; pct: number; answered: number }[]; target: number }) {
  const rows = data.map((d) => ({ ...d, label: d.date.slice(5).replace('-', '/') }));
  const last = data[data.length - 1];
  return (
    <ChartFrame title="Practice accuracy trend" description="Daily accuracy on bank questions (last 30 days with answers)" empty={data.length === 0} emptyText="Answer some practice questions to see your accuracy trend."
      summary={last ? `Latest day ${last.pct}% on ${last.answered} answers; ${data.length} days with data. Target ${target}%.` : ''}
      columns={['Date', 'Accuracy %', 'Answers']} rows={data.map((d) => [d.date, d.pct, d.answered])}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} minTickGap={16} />
          <YAxis tick={AXIS} domain={[0, 100]} unit="%" />
          <RTooltip contentStyle={TIP} formatter={(v: number, _n, p) => [`${v}% (${(p.payload as { answered: number }).answered} answers)`, 'Accuracy']} />
          <ReferenceLine y={target} stroke="rgb(var(--success))" strokeDasharray="5 4" label={{ value: `Target ${target}%`, fill: 'rgb(var(--success))', fontSize: 11, position: 'insideBottomRight' }} />
          <Line type="monotone" dataKey="pct" stroke="rgb(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'rgb(var(--primary))' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ExamHistoryChart({ data, passing, target }: { data: ExamPoint[]; passing: number; target: number }) {
  const last = data[data.length - 1];
  return (
    <ChartFrame title="Mock exam history" description={`Submitted exams, with the official ${passing}% passing line and your ${target}% practice target`} empty={data.length === 0}
      emptyText="No mock exams submitted yet. Take a full-length exam to see your trend." summary={last ? `${data.length} exams; the latest scored ${last.pct}%.` : ''}
      columns={['Exam #', 'Date', 'Score %', 'Type']} rows={data.map((d) => [d.n, d.label, d.pct, d.kind])}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="n" tick={AXIS} allowDecimals={false} label={{ value: 'Exam #', position: 'insideBottom', offset: -2, fill: 'rgb(var(--muted))', fontSize: 11 }} height={32} />
          <YAxis tick={AXIS} domain={[0, 100]} unit="%" />
          <RTooltip contentStyle={TIP} formatter={(v: number) => [`${v}%`, 'Score']} labelFormatter={(n) => `Exam ${n}`} />
          <ReferenceLine y={passing} stroke="rgb(var(--danger))" strokeDasharray="5 4" label={{ value: `Passing ${passing}%`, fill: 'rgb(var(--danger))', fontSize: 11, position: 'insideBottomRight' }} />
          <ReferenceLine y={target} stroke="rgb(var(--success))" strokeDasharray="5 4" label={{ value: `Target ${target}%`, fill: 'rgb(var(--success))', fontSize: 11, position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="pct" stroke="rgb(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: 'rgb(var(--primary))' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SectionPerformanceChart({ data }: { data: { name: string; accuracy: number | null; mastery: number; answered: number }[] }) {
  const rows = data.map((d) => ({ name: d.name, Accuracy: d.accuracy === null ? 0 : Math.round(d.accuracy * 100), Mastery: Math.round(d.mastery * 100) }));
  const any = data.some((d) => d.answered > 0 || d.mastery > 0);
  return (
    <ChartFrame title="Performance by section" description="Recent accuracy (last 40 answers) vs. concept mastery" height={Math.max(260, data.length * 40)} empty={!any || data.length === 0}
      emptyText="Practice a few sections to compare accuracy with mastery here."
      summary={`${data.filter((d) => d.answered > 0).length} of ${data.length} sections have practice answers.`}
      columns={['Section', 'Accuracy %', 'Mastery %', 'Answers']} rows={data.map((d) => [d.name, d.accuracy === null ? 'no answers' : Math.round(d.accuracy * 100), Math.round(d.mastery * 100), d.answered])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} unit="%" />
          <YAxis type="category" dataKey="name" tick={AXIS} width={112} interval={0} />
          <RTooltip contentStyle={TIP} formatter={(v: number) => `${v}%`} cursor={{ fill: 'rgb(var(--surface-2))' }} />
          <Legend />
          <Bar dataKey="Accuracy" fill="rgb(var(--primary))" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={10} />
          <Bar dataKey="Mastery" fill="rgb(var(--accent))" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
