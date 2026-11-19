/** Pure helpers for the analytics page (kept out of components so they can be unit tested). */
import { addDays, startOfWeek } from '@/lib/dates';
import type { MasteryLevel } from '@/lib/mastery';

export interface WeekPoint { weekStart: string; label: string; minutes: number }

/** Total minutes per Monday-start week for the last `weeks` weeks (oldest first, current week last). */
export function weeklyMinutes(secondsByDate: Record<string, number>, today: string, weeks = 8): WeekPoint[] {
  const thisWeek = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (weeks - 1 - i));
    let sec = 0;
    for (let d = 0; d < 7; d++) sec += secondsByDate[addDays(weekStart, d)] ?? 0;
    return { weekStart, label: shortDate(weekStart), minutes: Math.round(sec / 60) };
  });
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}`;
}

/** Flashcard retention: reviews not rated "again" / all reviews, over the last `days` days. null when no reviews. */
export function retention(reviews: { at: number; correct: boolean }[], now: number, days = 30): { pct: number | null; reviews: number; correct: number } {
  const since = now - days * 86_400_000;
  const recent = reviews.filter((r) => r.at >= since && r.at <= now + 60_000);
  const correct = recent.filter((r) => r.correct).length;
  return { pct: recent.length ? Math.round((correct / recent.length) * 100) : null, reviews: recent.length, correct };
}

/** Compare answer-weighted accuracy over the last 7 days with the 7 days before. */
export function accuracyDelta(trend: { date: string; pct: number; answered: number }[], today: string): { recent: number | null; prior: number | null; delta: number | null } {
  const from = (n: number) => addDays(today, -n);
  const avg = (pts: typeof trend) => {
    const n = pts.reduce((a, p) => a + p.answered, 0);
    return n ? Math.round(pts.reduce((a, p) => a + p.pct * p.answered, 0) / n) : null;
  };
  const recent = avg(trend.filter((p) => p.date > from(7) && p.date <= today));
  const prior = avg(trend.filter((p) => p.date > from(14) && p.date <= from(7)));
  return { recent, prior, delta: recent !== null && prior !== null ? recent - prior : null };
}

/** Minutes studied in the current Monday-start week vs the week before. */
export function weekOverWeek(weekly: WeekPoint[]): { thisWeek: number; lastWeek: number; delta: number } {
  const thisWeek = weekly[weekly.length - 1]?.minutes ?? 0;
  const lastWeek = weekly[weekly.length - 2]?.minutes ?? 0;
  return { thisWeek, lastWeek, delta: thisWeek - lastWeek };
}

export const LEVEL_INFO: Record<MasteryLevel, { label: string; glyph: string; cell: string; legend: string }> = {
  unseen: { label: 'Not seen', glyph: '·', cell: 'bg-surface-2 text-muted border-border', legend: 'bg-surface-2 border-border' },
  weak: { label: 'Weak (under 40%)', glyph: 'W', cell: 'bg-danger/80 text-primary-fg border-danger', legend: 'bg-danger/80 border-danger' },
  developing: { label: 'Developing (40-69%)', glyph: 'D', cell: 'bg-warning/80 text-primary-fg border-warning', legend: 'bg-warning/80 border-warning' },
  proficient: { label: 'Proficient (70-84%)', glyph: 'P', cell: 'bg-info/80 text-primary-fg border-info', legend: 'bg-info/80 border-info' },
  mastered: { label: 'Mastered (85%+, 3 confident correct on 2+ days)', glyph: 'M', cell: 'bg-success/80 text-primary-fg border-success', legend: 'bg-success/80 border-success' },
};
export const LEVEL_ORDER: MasteryLevel[] = ['unseen', 'weak', 'developing', 'proficient', 'mastered'];

export interface HeatRow { sectionId: string; name: string; cells: { id: string; name: string; level: MasteryLevel; score: number }[] }

export function buildHeatmap(
  sections: { id: string; shortName: string }[],
  conceptsBySection: Map<string, string[]>,
  mastery: Map<string, { level: MasteryLevel; score: number; attempts: number }>,
  nameOf: (id: string) => string,
): HeatRow[] {
  return sections.map((s) => ({
    sectionId: s.id,
    name: s.shortName,
    cells: (conceptsBySection.get(s.id) ?? []).map((id) => {
      const m = mastery.get(id);
      return { id, name: nameOf(id), level: (m && m.attempts ? m.level : 'unseen') as MasteryLevel, score: m && m.attempts ? m.score : 0 };
    }),
  }));
}

export interface ExamPoint { n: number; label: string; pct: number; kind: string }
export function examSeries(history: { pct: number; at: number; kind: string }[]): ExamPoint[] {
  return history.map((e, i) => {
    const d = new Date(e.at);
    return { n: i + 1, label: `${d.getMonth() + 1}/${d.getDate()}`, pct: Math.round(e.pct), kind: e.kind };
  });
}

export function hours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}
