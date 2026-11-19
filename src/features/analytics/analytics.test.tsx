import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { buildLearnerModel } from '@/db/learnerModel';
import { DEFAULT_SETTINGS, db, type AttemptRow } from '@/db/db';
import { localDate } from '@/lib/dates';
import AnalyticsPage, { Analytics } from './AnalyticsPage';
import { accuracyDelta, buildHeatmap, retention, weekOverWeek, weeklyMinutes } from './analyticsHelpers';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) (globalThis as unknown as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
// Recharts warns about 0x0 containers in jsdom; that is expected here.
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('The width(0)')) return; origWarn(...a); };

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><TooltipProvider>{ui}</TooltipProvider></MemoryRouter>);
const emptyRaw = () => ({ attempts: [], cards: [], cardReviews: [], lessonProgress: [], examSessions: [], studyLog: [], settings: DEFAULT_SETTINGS });

describe('analytics page', () => {
  it('renders honest empty states for a brand-new learner (live DB)', async () => {
    wrap(<AnalyticsPage />);
    expect(await screen.findByText(/nothing to chart yet/i)).toBeInTheDocument();
    expect(screen.getByText('Curriculum completed', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(/not approved pre-licensing credit/i, { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByTestId('measure-passing')).toHaveTextContent(/No full-length mock exam yet/);
    expect(screen.getByText('Estimated exam score')).toBeInTheDocument();
    expect(screen.getByText(/Answer practice questions to get an estimate/)).toBeInTheDocument();
    expect(screen.getByText('Why am I not ready?')).toBeInTheDocument();
    expect(screen.getByTestId('findings')).toBeInTheDocument(); // not-ready findings exist for an empty model
    expect(screen.getByText(/No study time recorded in the last 14 days/)).toBeInTheDocument();
    expect(screen.getByText(/No mock exams submitted yet/)).toBeInTheDocument();
    expect(screen.getByTestId('how-mastery')).toHaveTextContent(/half-life|halves every 21 days/);
    expect(screen.getByTestId('heatmap')).toBeInTheDocument();
  });

  it('shows retention and recent exam scores from data', () => {
    const now = Date.now();
    const model = buildLearnerModel({ ...emptyRaw(), examSessions: [] }, now);
    const reviews = [{ at: now - 86_400_000, correct: true }, { at: now - 2 * 86_400_000, correct: false }, { at: now - 60 * 86_400_000, correct: true }];
    wrap(<Analytics model={model} reviews={reviews} />);
    expect(screen.getByText('Flashcard retention').parentElement).toHaveTextContent('50%');
    expect(screen.getByText('Flashcard retention').parentElement).toHaveTextContent('1 of 2 reviews');
  });
});

describe('analytics helpers', () => {
  it('weeklyMinutes buckets by Monday-start weeks', () => {
    // 2026-11-19 is a Thursday; its week starts Monday 2026-11-16
    const w = weeklyMinutes({ '2026-11-16': 600, '2026-11-19': 1200, '2026-11-15': 3600 }, '2026-11-19', 8);
    expect(w).toHaveLength(8);
    expect(w[7]).toMatchObject({ weekStart: '2026-11-16', minutes: 30 });
    expect(w[6]).toMatchObject({ weekStart: '2026-11-09', minutes: 60 });
    expect(weekOverWeek(w)).toEqual({ thisWeek: 30, lastWeek: 60, delta: -30 });
  });
  it('retention counts only reviews in the window', () => {
    const now = 1_000_000_000_000;
    const r = retention([{ at: now - 1000, correct: true }, { at: now - 2000, correct: false }, { at: now - 40 * 86_400_000, correct: false }], now, 30);
    expect(r).toEqual({ pct: 50, reviews: 2, correct: 1 });
    expect(retention([], now).pct).toBeNull();
  });
  it('accuracyDelta compares the last 7 days with the 7 before, weighted by answers', () => {
    const t = [
      { date: '2026-11-10', pct: 50, answered: 10 }, { date: '2026-11-11', pct: 60, answered: 10 },
      { date: '2026-11-18', pct: 80, answered: 10 }, { date: '2026-11-19', pct: 90, answered: 30 },
    ];
    expect(accuracyDelta(t, '2026-11-19')).toEqual({ recent: 88, prior: 55, delta: 33 });
    expect(accuracyDelta([], '2026-11-19').delta).toBeNull();
  });
  it('heatmap rows list a section\'s concepts with their mastery level', () => {
    const rows = buildHeatmap([{ id: 'ann', shortName: 'Annuities' }, { id: 'tax', shortName: 'Tax' }], new Map([['ann', ['a', 'b']]]),
      new Map([['a', { level: 'mastered' as const, score: 0.9, attempts: 5 }]]), (id) => id.toUpperCase());
    expect(rows[0].cells).toEqual([{ id: 'a', name: 'A', level: 'mastered', score: 0.9 }, { id: 'b', name: 'B', level: 'unseen', score: 0 }]);
    expect(rows[1].cells).toEqual([]);
  });
});

describe('analytics with data', () => {
  it('uses the learner model: attempts produce an accuracy tile', async () => {
    const at = Date.now();
    const a = (i: number, correct: boolean): AttemptRow => ({ questionId: `gen-q00${i}`, sectionId: 'gen', concepts: [], difficulty: 2, correct, choiceId: 'a', confidence: 'sure', responseMs: 1000, mode: 'topic', sessionId: 's', at });
    await db.attempts.bulkAdd([a(1, true), a(2, true), a(3, false), a(4, true)]);
    await db.studyLog.put({ key: `${localDate(at)}|practice`, date: localDate(at), kind: 'practice', seconds: 600 });
    wrap(<AnalyticsPage />);
    const tile = await waitFor(() => { const el = screen.getByText('Practice accuracy').parentElement!; expect(el).toHaveTextContent('75%'); return el; });
    expect(within(tile).getByText(/4 answers/)).toBeInTheDocument();
    expect(screen.getByText('Studied today').parentElement).toHaveTextContent('10 min');
    expect(screen.getByRole('img', { name: /Daily study minutes/ })).toBeInTheDocument();
    await db.attempts.clear(); await db.studyLog.clear();
  });
});
