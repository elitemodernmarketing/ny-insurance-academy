import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import type { BeneficiaryCase, ClientProfile, ComplianceCase, PolicyTimeline } from '@/content/schema';
import { db } from '@/db/db';
import ScenarioPage from './ScenarioPage';

const v = { status: 'reviewed' as const, method: 'general-principle' as const, checkedOn: '2026-01-01' };
const prov = { sources: [], nySpecific: false, timeSensitive: false, verification: v };

const profile: ClientProfile = {
  id: 'test-client', name: 'Pat Tester', age: 40, summary: 'A test client.', goal: 'Protect the family.',
  facts: [{ label: 'Income', value: '$80,000' }, { label: 'Dependents', value: '2' }, { label: 'Debt', value: '$10,000' }],
  decisions: [
    { prompt: 'First decision?', options: [{ text: 'Term policy', quality: 'best', feedback: 'Term fits.' }, { text: 'Whole life', quality: 'acceptable', feedback: 'Costly.' }, { text: 'Nothing', quality: 'poor', feedback: 'No cover.' }] },
    { prompt: 'Second decision?', options: [{ text: 'Level term', quality: 'best', feedback: 'Level is fine.' }, { text: 'Skip', quality: 'poor', feedback: 'Bad.' }] },
  ],
  takeaways: ['Match product to need.', 'Review often.'], concepts: [], outlineIds: ['lib.1'], ...prov,
};
const bcase: BeneficiaryCase = {
  id: 'test-case', title: 'Two children', setup: 'Insured names two children.', faceAmount: 100000,
  designation: { primary: [{ name: 'Ann', relation: 'daughter', sharePct: 50 }, { name: 'Ben', relation: 'son', sharePct: 50 }], contingent: [], distribution: 'per-capita', revocable: true },
  events: [
    { id: 'ben-dies', label: 'Ben dies first', outcome: 'Ann takes everything under per capita.', payouts: [{ name: 'Ann', amount: 100000 }] },
    { id: 'both-live', label: 'Both survive', outcome: 'Each gets half.', payouts: [{ name: 'Ann', amount: 50000 }, { name: 'Ben', amount: 50000 }] },
  ], concepts: [], outlineIds: ['lib.1'], ...prov,
};
const timeline: PolicyTimeline = {
  id: 'test-timeline', title: 'Lapse and reinstatement', intro: 'Follow a policy.', concepts: [], outlineIds: ['lpr.1'], ...prov,
  steps: [
    { id: 's1', day: 0, label: 'Application', detail: 'Applied.', status: 'pending', sources: [] },
    { id: 's2', day: 5, label: 'Policy issued', detail: 'In force.', status: 'in-force', sources: [], question: { prompt: 'Is it in force?', choices: ['Yes', 'No', 'Maybe', 'Unknown'], answerIndex: 0, explanation: 'Issued means in force.' } },
    { id: 's3', day: 40, label: 'Missed premium', detail: 'Grace period.', status: 'grace', sources: [] },
    { id: 's4', day: 80, label: 'Lapsed', detail: 'Lapsed.', status: 'lapsed', sources: [] },
    { id: 's5', day: 100, label: 'Reinstated', detail: 'Back.', status: 'reinstated', sources: [] },
  ],
};
const ccase: ComplianceCase = {
  id: 'test-compliance', title: 'The discount', narrative: 'An agent offers part of the commission back.', question: 'What is this?',
  options: [{ id: 'a', text: 'Rebating', rationale: 'Yes.' }, { id: 'b', text: 'Twisting', rationale: 'No.' }, { id: 'c', text: 'Fine', rationale: 'No.' }, { id: 'd', text: 'Privacy', rationale: 'No.' }],
  correct: 'a', issue: 'rebating', explanation: 'Giving back commission is rebating.', concepts: [], outlineIds: ['reg.2'], ...prov,
};

const saved = { c: [] as ClientProfile[], b: [] as BeneficiaryCase[], t: [] as PolicyTimeline[], k: [] as ComplianceCase[] };
beforeAll(() => {
  saved.c = content.clientProfiles.splice(0, content.clientProfiles.length, profile);
  saved.b = content.beneficiaryCases.splice(0, content.beneficiaryCases.length, bcase);
  saved.t = content.policyTimelines.splice(0, content.policyTimelines.length, timeline);
  saved.k = content.complianceCases.splice(0, content.complianceCases.length, ccase);
});
afterAll(() => {
  content.clientProfiles.splice(0, 1, ...saved.c); content.beneficiaryCases.splice(0, 1, ...saved.b);
  content.policyTimelines.splice(0, 1, ...saved.t); content.complianceCases.splice(0, 1, ...saved.k);
});
beforeEach(async () => { await db.scenarioProgress.clear(); await db.attempts.clear(); });

const open = (id: string) => render(
  <MemoryRouter initialEntries={[`/scenarios/${id}`]}><TooltipProvider><Routes><Route path="/scenarios/:scenarioId" element={<ScenarioPage />} /></Routes></TooltipProvider></MemoryRouter>,
);

describe('life-selection', () => {
  it('walks through decisions, shows rated feedback and records completion', async () => {
    const user = userEvent.setup();
    open('life-selection');
    await user.click(screen.getByTestId('life-profile'));
    expect(screen.getByRole('row', { name: /Income/ })).toHaveTextContent('$80,000');
    expect(screen.getByText(/Protect the family/)).toBeInTheDocument();
    await user.click(screen.getAllByTestId('life-option')[1]);
    expect(screen.getByText('Acceptable')).toBeInTheDocument();
    expect(screen.getByText('Costly.')).toBeInTheDocument();
    await user.click(screen.getByTestId('life-next'));
    await user.click(screen.getAllByTestId('life-option')[0]);
    await user.click(screen.getByTestId('life-next'));
    expect(screen.getByText('Key takeaways')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument(); // (0.5 + 1) / 2
    await waitFor(async () => expect(await db.scenarioProgress.get('life-selection:test-client')).toMatchObject({ score: 75, kind: 'life-selection' }));
  });
});

describe('beneficiary', () => {
  it('lets the learner predict before revealing and compares per person', async () => {
    const user = userEvent.setup();
    open('beneficiary');
    await user.click(screen.getByTestId('beneficiary-case'));
    expect(screen.getByText('$100,000')).toBeInTheDocument();
    expect(screen.getByText(/Per capita/)).toBeInTheDocument();
    await user.click(screen.getAllByTestId('beneficiary-event')[0]);
    expect(screen.queryByTestId('beneficiary-outcome')).not.toBeInTheDocument(); // not revealed yet
    const guesses = screen.getAllByTestId('beneficiary-guess');
    await user.type(guesses[0], '50000'); await user.type(guesses[1], '50000'); // wrong: Ann 50k, Ben 50k
    await user.click(screen.getByTestId('beneficiary-check'));
    const out = screen.getByTestId('beneficiary-outcome');
    expect(out).toHaveTextContent('differs from the outcome');
    expect(out).toHaveTextContent('Ann takes everything');
    await user.click(screen.getAllByTestId('beneficiary-event')[1]);
    const g2 = screen.getAllByTestId('beneficiary-guess');
    await user.type(g2[0], '50000'); await user.type(g2[1], '50000');
    await user.click(screen.getByTestId('beneficiary-check'));
    expect(screen.getByTestId('beneficiary-outcome')).toHaveTextContent('prediction was correct');
    await waitFor(async () => expect((await db.scenarioProgress.get('beneficiary:test-case'))?.score).toBe(50));
  });
});

describe('policy-timeline', () => {
  it('steps through statuses (with text labels) and answers the step question', async () => {
    const user = userEvent.setup();
    open('policy-timeline');
    expect(screen.getAllByTestId('timeline-step')).toHaveLength(5);
    expect(screen.getAllByText(/Status: Pending/).length).toBeGreaterThan(0);
    await user.click(screen.getByTestId('timeline-next'));
    expect(screen.getAllByText(/Status: In force/).length).toBeGreaterThan(0);
    await user.click(within(screen.getByTestId('timeline-question')).getAllByTestId('timeline-choice')[0]);
    expect(screen.getByText(/Issued means in force/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(screen.getByTestId('timeline-next'));
    expect(screen.getAllByText(/Status: Reinstated/).length).toBeGreaterThan(0);
    await waitFor(async () => expect(await db.scenarioProgress.get('policy-timeline:test-timeline')).toMatchObject({ score: 100 }));
  });
});

describe('compliance', () => {
  it('shows rationale, issue badge and completion after answering', async () => {
    const user = userEvent.setup();
    open('compliance');
    expect(screen.getByTestId('compliance-narrative')).toHaveTextContent('commission back');
    await user.click(screen.getAllByTestId('compliance-option')[1]); // wrong
    const fb = screen.getByTestId('compliance-feedback');
    expect(fb).toHaveTextContent('Incorrect');
    expect(within(fb).getByTestId('compliance-issue')).toHaveTextContent('Rebating');
    expect(fb).toHaveTextContent('Giving back commission is rebating.');
    expect(screen.getAllByText(/Why:/)).toHaveLength(4);
    await user.click(screen.getByTestId('compliance-next'));
    expect(screen.getByText('Cases complete')).toBeInTheDocument();
    await waitFor(async () => expect(await db.scenarioProgress.get('compliance:test-compliance')).toMatchObject({ score: 0 }));
  });
});

describe('unknown scenario', () => {
  it('shows a not-found state', () => {
    open('nope');
    expect(screen.getByText('Scenario not found')).toBeInTheDocument();
  });
});
