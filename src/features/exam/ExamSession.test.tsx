import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { content } from '@/content';
import { renderRoutes, resetDb } from '../testUtils';
import ExamSession from './ExamSession';
import ExamResults from './ExamResults';
import { createExamSession, planExam } from './examService';

const routes = [
  { path: '/exam/:sessionId', element: <ExamSession /> },
  { path: '/exam/:sessionId/results', element: <ExamResults /> },
];

async function newExam(now = Date.now()) {
  return createExamSession(planExam('custom', 25, 5), now);
}

describe('ExamSession', () => {
  beforeEach(resetDb);

  it('persists answers, flags and position immediately and restores them after a reload', async () => {
    const user = userEvent.setup();
    const row = await newExam();
    const first = renderRoutes(`/exam/${row.id}`, routes);
    await screen.findByTestId('exam-timer');
    await user.click(screen.getByTestId('choice-1'));
    await waitFor(async () => expect(Object.keys((await db.examSessions.get(row.id))!.answers)).toHaveLength(1));
    const chosenId = (await db.examSessions.get(row.id))!.answers[row.questionIds[0]];
    expect(chosenId).toBe(row.choiceOrders[row.questionIds[0]][1]);
    await user.click(screen.getByTestId('exam-flag'));
    await user.click(screen.getByTestId('exam-next'));
    await user.click(screen.getByTestId('exam-next'));
    await waitFor(async () => {
      const s = (await db.examSessions.get(row.id))!;
      expect(s.currentIndex).toBe(2);
      expect(s.flags).toEqual([row.questionIds[0]]);
    });
    // no feedback during the exam
    expect(screen.queryByTestId('explanation')).toBeNull();
    first.unmount();

    renderRoutes(`/exam/${row.id}`, routes);
    await screen.findByTestId('exam-timer');
    expect(screen.getByTestId('nav-q-3')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('nav-q-1')).toHaveAccessibleName(/answered, flagged/);
    expect(screen.getByTestId('nav-q-2')).toHaveAccessibleName(/unanswered/);
    await userEvent.click(screen.getByTestId('exam-prev'));
    await userEvent.click(screen.getByTestId('exam-prev'));
    expect(screen.getByTestId('choice-1')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the review screen with unanswered and flagged jump links and submits after confirmation', async () => {
    const user = userEvent.setup();
    const row = await newExam();
    renderRoutes(`/exam/${row.id}`, routes);
    await screen.findByTestId('exam-timer');
    await user.click(screen.getByTestId('choice-0'));
    await user.click(screen.getByTestId('exam-next'));
    await user.click(screen.getByTestId('exam-flag'));
    await user.click(screen.getByTestId('exam-review-submit'));
    const unanswered = await screen.findByTestId('review-unanswered');
    expect(within(unanswered).getAllByRole('button')).toHaveLength(row.questionIds.length - 1);
    expect(within(screen.getByTestId('review-flagged')).getByRole('button', { name: /flagged question 2/i })).toBeInTheDocument();
    // jump link returns to that question
    await user.click(within(screen.getByTestId('review-flagged')).getByRole('button', { name: /flagged question 2/i }));
    expect(screen.getByTestId('nav-q-2')).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByTestId('exam-review-submit'));
    await user.click(screen.getByTestId('exam-submit-final'));
    await user.click(await screen.findByTestId('exam-confirm-submit'));
    await screen.findByTestId('exam-score');
    const stored = (await db.examSessions.get(row.id))!;
    expect(stored.status).toBe('submitted');
    expect(stored.autoSubmitted).toBe(false);
    expect(stored.result!.correct + stored.result!.incorrect + stored.result!.unanswered).toBe(row.questionIds.length);
    expect(await db.attempts.where('sessionId').equals(row.id).count()).toBe(row.questionIds.length);
    // results page content
    expect(screen.getByTestId('exam-pass-status')).toHaveTextContent(/FAIL|PASS/);
    expect(screen.getByTestId('results-by-section')).toBeInTheDocument();
    expect(screen.getByText(/do not predict or guarantee/i)).toBeInTheDocument();
  });

  it('submits automatically and immediately when opened after the deadline', async () => {
    const row = await newExam(Date.now() - (row0Minutes() + 30) * 60_000);
    renderRoutes(`/exam/${row.id}`, routes);
    await screen.findByTestId('exam-score');
    const stored = (await db.examSessions.get(row.id))!;
    expect(stored.status).toBe('submitted');
    expect(stored.autoSubmitted).toBe(true);
    expect(stored.result!.unanswered).toBe(row.questionIds.length);
    expect(stored.result!.timeUsedMs).toBe(row.timeLimitMin * 60_000);
    expect(screen.getByText(/submitted automatically/i)).toBeInTheDocument();
  });

  it('redirects a submitted exam to its results and shows an empty state for unknown ids', async () => {
    const row = await newExam(Date.now() - 10_000_000);
    renderRoutes(`/exam/${row.id}`, routes);
    await screen.findByTestId('exam-score');
    renderRoutes('/exam/nope', routes);
    expect(await screen.findByText(/Exam not found/i)).toBeInTheDocument();
    expect(content.questions.length).toBeGreaterThan(0);
  });
});

function row0Minutes() { return planExam('custom', 25, 5).timeLimitMin; }
