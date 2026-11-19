import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/db';
import { content } from '@/content';
import { renderRoutes, resetDb } from '../testUtils';
import PracticeSession from './PracticeSession';
import PracticeHome from './PracticeHome';
import { createPracticeSession } from './practiceService';

const routes = [
  { path: '/practice/session/:sessionId', element: <PracticeSession /> },
  { path: '/practice', element: <PracticeHome /> },
];

describe('PracticeSession', () => {
  beforeEach(resetDb);

  it('answers with feedback, persists, and resumes on the same question after a reload', async () => {
    const user = userEvent.setup();
    const qs = content.questions.slice(0, 3);
    const row = await createPracticeSession({ mode: 'learn', questions: qs, config: { feedback: 'immediate' } });
    const first = renderRoutes(`/practice/session/${row.id}`, routes);
    await screen.findByTestId('practice-submit');
    expect(screen.getByTestId('practice-submit')).toBeDisabled();
    await user.click(screen.getByTestId('choice-2'));
    await user.click(screen.getByTestId('practice-submit'));
    await screen.findByTestId('explanation');
    const stored = (await db.practiceSessions.get(row.id))!;
    expect(Object.keys(stored.answers)).toEqual([qs[0].id]);
    expect(stored.answers[qs[0].id].choiceId).toBe(row.choiceOrders[qs[0].id][2]);
    expect(await db.attempts.count()).toBe(1);
    first.unmount();

    // reload mid-session: same question, feedback still visible, no duplicate attempt
    renderRoutes(`/practice/session/${row.id}`, routes);
    await screen.findByTestId('explanation');
    expect(screen.getByText(/Question 1 of 3/)).toBeInTheDocument();
    await user.click(screen.getByTestId('practice-next'));
    await screen.findByTestId('practice-submit');
    expect((await db.practiceSessions.get(row.id))!.index).toBe(1);
    expect(screen.getByText(/Question 2 of 3/)).toBeInTheDocument();
    expect(await db.attempts.count()).toBe(1);
  });

  it('supports keyboard selection and Enter to submit and continue', async () => {
    const user = userEvent.setup();
    const qs = content.questions.slice(0, 2);
    const row = await createPracticeSession({ mode: 'topic', questions: qs, config: { feedback: 'immediate' } });
    renderRoutes(`/practice/session/${row.id}`, routes);
    await screen.findByTestId('practice-submit');
    await user.keyboard('3');
    expect(screen.getByTestId('choice-2')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    await screen.findByTestId('explanation');
    await waitFor(() => expect(screen.getByTestId('practice-next')).toHaveFocus());
    await user.keyboard('{Enter}');
    await screen.findByTestId('practice-submit');
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
  });

  it('feedback-at-end shows no explanation and ends with a summary, missed list and retry', async () => {
    const user = userEvent.setup();
    const qs = content.questions.slice(0, 2);
    const row = await createPracticeSession({ mode: 'topic', questions: qs, config: { feedback: 'end' } });
    renderRoutes(`/practice/session/${row.id}`, routes);
    await screen.findByTestId('practice-submit');
    const wrongIdx = row.choiceOrders[qs[0].id].indexOf(qs[0].choices.find((c) => c.id !== qs[0].correct)!.id);
    await user.click(screen.getByTestId(`choice-${wrongIdx}`));
    await user.click(screen.getByTestId('practice-submit'));
    expect(screen.queryByTestId('explanation')).toBeNull();
    await screen.findByText(/Question 2 of 2/);
    const rightIdx = row.choiceOrders[qs[1].id].indexOf(qs[1].correct);
    await user.click(screen.getByTestId(`choice-${rightIdx}`));
    await user.click(screen.getByTestId('practice-submit'));
    expect(await screen.findByTestId('practice-final-score')).toHaveTextContent('1/2');
    expect(screen.getAllByTestId('missed-question')).toHaveLength(1);
    expect(screen.getByTestId('flashcards-note')).toHaveTextContent(/added to your flashcards automatically/i);
    expect(screen.getByTestId('retry-missed')).toBeInTheDocument();
    expect(screen.getByTestId('new-session')).toBeInTheDocument();
    expect((await db.practiceSessions.get(row.id))!.status).toBe('completed');
  });

  it('explain mode checks the written explanation and shows the full explanation', async () => {
    const user = userEvent.setup();
    const q = content.questions[0];
    const row = await createPracticeSession({ mode: 'explain', questions: [q], config: { feedback: 'immediate' } });
    renderRoutes(`/practice/session/${row.id}`, routes);
    await screen.findByTestId('explain-text');
    await user.click(screen.getByTestId('choice-0'));
    await user.type(screen.getByTestId('explain-text'), 'Because of the concept in question.');
    await user.click(screen.getByTestId('practice-submit'));
    await screen.findByTestId('rubric-feedback');
    expect(screen.getByTestId('explanation')).toBeInTheDocument();
    const att = (await db.attempts.where('sessionId').equals(row.id).first())!;
    expect(att.explanation).toBe('Because of the concept in question.');
    expect(att.rubricScore).toBeTypeOf('number');
  });

  it('lists in-progress sessions on the practice page with resume and discard', async () => {
    const user = userEvent.setup();
    const row = await createPracticeSession({ mode: 'learn', questions: content.questions.slice(0, 2), config: { feedback: 'immediate' } });
    renderRoutes('/practice', routes);
    expect(await screen.findByTestId('resume-practice')).toHaveAttribute('href', `/practice/session/${row.id}`);
    await user.click(screen.getByRole('button', { name: /discard session/i }));
    await user.click(await screen.findByTestId('confirm-discard'));
    await waitFor(async () => expect(await db.practiceSessions.count()).toBe(0));
  });

  it('starts a topic quiz from query params', async () => {
    const user = userEvent.setup();
    const sec = content.sections.find((s) => (content.questionsBySection.get(s.id)?.length ?? 0) >= 5)!;
    renderRoutes(`/practice?mode=topic&section=${sec.id}`, [...routes, { path: '/practice/session/:sessionId', element: <PracticeSession /> }]);
    const start = await screen.findByTestId('start-practice');
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByTestId(`section-${sec.id}`)).toBeChecked();
    await user.click(start);
    await screen.findByTestId('practice-submit');
    const rows = await db.practiceSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('topic');
    expect(rows[0].config.sectionIds).toEqual([sec.id]);
    expect(rows[0].questionIds.every((id) => content.questionById.get(id)!.sectionId === sec.id)).toBe(true);
  });

  it('weakness drill shows an empty state when there is no history', async () => {
    renderRoutes('/practice?mode=weakness', routes);
    expect(await screen.findByText(/No weaknesses to drill yet/i)).toBeInTheDocument();
    expect(screen.getByTestId('start-practice')).toBeDisabled();
  });
});
