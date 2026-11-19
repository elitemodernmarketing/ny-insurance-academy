import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { content } from '@/content';
import { db } from '@/db/db';
import { updateSettings } from '@/db/repo';
import { renderRoutes, resetDb } from '../testUtils';
import ExamHome from './ExamHome';
import ExamSession from './ExamSession';
import { createExamSession, planExam } from './examService';

const routes = [
  { path: '/exam', element: <ExamHome /> },
  { path: '/exam/:sessionId', element: <ExamSession /> },
  { path: '/exam/:sessionId/results', element: <div data-testid="results-route" /> },
];
const hasEmptySection = content.sections.some((s) => !(content.questionsBySection.get(s.id)?.length));

describe('ExamHome', () => {
  beforeEach(resetDb);

  it('shows the allocation table, practice target and disclaimer', async () => {
    await updateSettings({ practiceTarget: 88 });
    renderRoutes('/exam', routes);
    const table = await screen.findByTestId('exam-allocation');
    expect(within(table).getAllByRole('row')).toHaveLength(content.sections.length + 2);
    expect(within(table).getByText('150')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('practice-target')).toHaveTextContent('88%'));
    expect(screen.getAllByText(/do not predict or guarantee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not an official exam format/i).length).toBeGreaterThan(0);
  });

  it.runIf(hasEmptySection)('reports the coverage shortfall and starts an explicitly shortened exam without duplicates', async () => {
    const user = userEvent.setup();
    renderRoutes('/exam', routes);
    expect(await screen.findByTestId('exam-shortfall')).toHaveTextContent(/Not enough questions/i);
    const btn = screen.getByTestId('start-full-exam');
    expect(btn).toHaveTextContent(/shortened exam/i);
    await user.click(btn);
    await screen.findByTestId('exam-timer');
    const rows = await db.examSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('custom');
    expect(rows[0].size).toBeLessThan(150);
    expect(rows[0].shortfalls.length).toBeGreaterThan(0);
    expect(new Set(rows[0].questionIds).size).toBe(rows[0].questionIds.length);
    expect(screen.getByText(/Shortened full exam/)).toBeInTheDocument();
  });

  it('starts a 25-question custom practice exam with a one-minute-per-question limit', async () => {
    const user = userEvent.setup();
    renderRoutes('/exam', routes);
    const btn = await screen.findByTestId('start-custom-exam-25');
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);
    await screen.findByTestId('exam-timer');
    const [row] = await db.examSessions.toArray();
    expect(row.kind).toBe('custom');
    expect(row.timeLimitMin).toBe(row.size);
    expect(row.deadline - row.startedAt).toBe(row.timeLimitMin * 60_000);
  });

  it('lists in-progress exams to resume and submitted exams with a results link', async () => {
    const inprog = await createExamSession(planExam('custom', 25, 1));
    renderRoutes('/exam', routes);
    expect(await screen.findByTestId('resume-exam')).toHaveAttribute('href', `/exam/${inprog.id}`);
    await db.examSessions.update(inprog.id, { status: 'submitted', submittedAt: Date.now(), result: { total: 10, correct: 8, incorrect: 2, unanswered: 0, pct: 80, passed: true, passingPercent: 70, bySection: [], missedIds: [], timeUsedMs: 1000 } });
    const link = await screen.findByTestId('exam-history-item');
    expect(link).toHaveAttribute('href', `/exam/${inprog.id}/results`);
    expect(link).toHaveTextContent('80%');
    expect(link).toHaveTextContent(/Pass/);
  });
});
