import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { content } from '@/content';
import { recordAttempt } from '@/db/repo';
import { renderRoutes, resetDb } from '../testUtils';
import ReviewPage from './ReviewPage';
import PracticeSession from '../practice/PracticeSession';
import { latestMissed } from './reviewService';

const routes = [
  { path: '/review', element: <ReviewPage /> },
  { path: '/practice/session/:sessionId', element: <PracticeSession /> },
];
const att = (qid: string, correct: boolean, at: number) => {
  const q = content.questionById.get(qid)!;
  return recordAttempt({ questionId: qid, sectionId: q.sectionId, concepts: q.concepts, difficulty: q.difficulty, correct, choiceId: correct ? q.correct : q.choices.find((c) => c.id !== q.correct)!.id, confidence: null, responseMs: 1000, mode: 'topic', sessionId: 's', at });
};

describe('weakness review', () => {
  beforeEach(resetDb);

  it('latestMissed keeps only questions whose most recent attempt was incorrect and ignores non-bank ids', async () => {
    const [a, b, c] = content.questions;
    await att(a.id, false, 1); await att(a.id, true, 2);   // recovered
    await att(b.id, true, 1); await att(b.id, false, 2);   // missed now
    await att(c.id, false, 5);
    await db.attempts.add({ questionId: 'term:foo', sectionId: 'gen', concepts: [], difficulty: 1, correct: false, choiceId: null, confidence: null, responseMs: 0, mode: 'glossary', sessionId: 'x', at: 9 });
    await db.attempts.add({ questionId: 'zzz-q999', sectionId: 'gen', concepts: [], difficulty: 1, correct: false, choiceId: null, confidence: null, responseMs: 0, mode: 'topic', sessionId: 'x', at: 9 });
    const m = latestMissed(await db.attempts.toArray());
    expect(m.map((x) => x.question.id)).toEqual([c.id, b.id]);
  });

  it('shows an empty state when nothing has been missed', async () => {
    renderRoutes('/review', routes);
    expect(await screen.findByText(/Nothing to review yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('start-weakness-drill')).toHaveAttribute('href', '/practice?mode=weakness');
  });

  it('groups missed questions, expands them, and starts a practice session of those ids', async () => {
    const user = userEvent.setup();
    const [a, b] = content.questions;
    await att(a.id, false, 10); await att(b.id, false, 11);
    renderRoutes('/review', routes);
    const groups = await screen.findAllByTestId('missed-group');
    expect(groups.length).toBeGreaterThan(0);
    const items = screen.getAllByTestId('missed-item');
    expect(items).toHaveLength(2);
    await user.click(within(items[0]).getByRole('button'));
    expect(await screen.findByTestId('explanation')).toBeInTheDocument();
    await user.click(screen.getByTestId('practice-missed-again'));
    await screen.findByTestId('practice-submit');
    const rows = await db.practiceSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('review');
    expect([...rows[0].questionIds].sort()).toEqual([a.id, b.id].sort());
  });
});
