import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { content } from '@/content';
import type { GlossaryTerm } from '@/content/schema';
import { computeCosts } from '@/lib/medicalCost';
import { db } from '@/db/db';
import DeductibleScenario from './DeductibleScenario';
import ScenariosHome from './ScenariosHome';
import TerminologyChallenge from './TerminologyChallenge';
import { buildRounds, maskTerm } from './terminology';
import { comparePrediction, sumPayouts } from './beneficiaryHelpers';
import { DEFAULT_INPUTS, PRESETS, explainLine, money, num } from './deductibleModel';

// jsdom has no ResizeObserver (Recharts' ResponsiveContainer needs one).
if (!('ResizeObserver' in globalThis)) (globalThis as unknown as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Recharts warns about 0x0 containers in jsdom; that is expected here.
const origWarn = console.warn;
console.warn = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('The width(0)')) return; origWarn(...a); };

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><TooltipProvider>{ui}</TooltipProvider></MemoryRouter>);

function fakeTerm(id: string, term: string, sectionId: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm {
  return {
    id, term, aliases: [], sectionId, outlineIds: ['x.1'], formal: `${term} formal`, plain: `${term} is the plain meaning of ${id}.`,
    simpler: 's', examples: [`An example using ${term} in practice.`, 'Second example without the name'], examTip: 't', misconception: 'm',
    related: [], confusedWith: [], difficulty: 2, practice: { prompt: 'p', choices: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'e' },
    sources: [], nySpecific: false, timeSensitive: false, verification: { status: 'reviewed', method: 'general-principle', checkedOn: '2026-01-01' },
    ...extra,
  } as GlossaryTerm;
}
const TERMS = [
  ...['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((n) => fakeTerm(n, n[0].toUpperCase() + n.slice(1), 'gen')),
  ...['foxtrot', 'golf', 'hotel'].map((n) => fakeTerm(n, n[0].toUpperCase() + n.slice(1), 'lib')),
  ...['india', 'juliet', 'kilo', 'lima', 'mike', 'november'].map((n) => fakeTerm(n, n[0].toUpperCase() + n.slice(1), 'ann')),
];

beforeEach(async () => { await db.scenarioProgress.clear(); });

describe('deductible scenario', () => {
  it('renders itemized numbers that match computeCosts', () => {
    wrap(<DeductibleScenario />);
    const expected = computeCosts(DEFAULT_INPUTS, PRESETS[0].bills);
    // ER visit by hand: copay 150 + deductible 1000 + 20% of the remaining 850 = 170 -> 1,320 patient, 680 insurer
    expect(expected.lines[0]).toMatchObject({ copay: 150, deductible: 1000, coinsurance: 170, patientTotal: 1320, insurerPays: 680 });
    const rows = screen.getAllByTestId('cost-row');
    expect(rows).toHaveLength(3);
    const first = within(rows[0]);
    expect(first.getByText('Emergency room visit')).toBeInTheDocument();
    expect(rows[0].querySelector('[data-col="copay"]')).toHaveTextContent('$150');
    expect(rows[0].querySelector('[data-col="deductible"]')).toHaveTextContent('$1,000');
    expect(rows[0].querySelector('[data-col="coinsurance"]')).toHaveTextContent('$170');
    expect(rows[0].querySelector('[data-col="patient"]')).toHaveTextContent('$1,320');
    expect(rows[0].querySelector('[data-col="insurer"]')).toHaveTextContent('$680');
    expect(screen.getByTestId('total-patient')).toHaveTextContent(money(expected.patientTotal));
    expect(screen.getByTestId('total-insurer')).toHaveTextContent(money(expected.insurerTotal));
    expect(screen.getAllByTestId('line-explanation')).toHaveLength(3);
    expect(screen.getByText(/simplified teaching model/i)).toBeInTheDocument();
  });

  it('recalculates on Calculate with edited terms and shows the capped flag', async () => {
    const user = userEvent.setup();
    wrap(<DeductibleScenario />);
    await user.click(screen.getByTestId('preset-surgery'));
    const oop = screen.getByTestId('input-oop');
    await user.clear(oop); await user.type(oop, '2500');
    await user.click(screen.getByTestId('calc-deductible'));
    const exp = computeCosts({ ...DEFAULT_INPUTS, outOfPocketMax: 2500 }, PRESETS[1].bills);
    expect(screen.getByTestId('total-patient')).toHaveTextContent(money(exp.patientTotal));
    expect(exp.patientTotal).toBe(2500);
    expect(screen.getAllByText(/Capped at OOP max/).length).toBeGreaterThan(0);
    await waitFor(async () => expect((await db.scenarioProgress.get('deductible'))?.attempts).toBe(1));
  });

  it('supports adding and removing bills', async () => {
    const user = userEvent.setup();
    wrap(<DeductibleScenario />);
    await user.click(screen.getByRole('button', { name: /remove bill 3/i }));
    await user.click(screen.getByTestId('calc-deductible'));
    expect(screen.getAllByTestId('cost-row')).toHaveLength(2);
    await user.click(screen.getByTestId('add-bill'));
    await user.type(screen.getByLabelText('Bill 3 amount'), '500');
    await user.click(screen.getByTestId('calc-deductible'));
    expect(screen.getAllByTestId('cost-row')).toHaveLength(3);
  });

  it('explains a capped line in plain English', () => {
    const r = computeCosts({ deductible: 500, coinsurancePct: 20, outOfPocketMax: 600, copayCountsTowardOOP: true }, [{ label: 'Hospital', amount: 10000 }]);
    const s = explainLine(r.lines[0], { deductible: 500, coinsurancePct: 20, outOfPocketMax: 600, copayCountsTowardOOP: true });
    expect(s).toMatch(/out-of-pocket maximum was reached/);
    expect(s).toContain('$600');
  });
  it('parses money fields defensively', () => { expect(num('$1,250')).toBe(1250); expect(num('abc')).toBe(0); expect(num('-5')).toBe(0); });
});

describe('terminology challenge generation', () => {
  it('produces 10 rounds with 4 unique choices including the answer', () => {
    const rounds = buildRounds(TERMS, 42, 10);
    expect(rounds).toHaveLength(10);
    for (const r of rounds) {
      expect(r.choices).toHaveLength(4);
      expect(new Set(r.choices.map((c) => c.id)).size).toBe(4);
      expect(new Set(r.choices.map((c) => c.term)).size).toBe(4);
      expect(r.choices.some((c) => c.id === r.answerId)).toBe(true);
    }
    expect(new Set(rounds.map((r) => r.termId)).size).toBe(10);
  });
  it('is deterministic per seed and differs across seeds', () => {
    expect(buildRounds(TERMS, 7)).toEqual(buildRounds(TERMS.slice().reverse(), 7));
    expect(buildRounds(TERMS, 7)).not.toEqual(buildRounds(TERMS, 8));
  });
  it('prefers distractors from the same section', () => {
    const rounds = buildRounds(TERMS, 3, 10);
    const bySection = new Map(TERMS.map((t) => [t.id, t.sectionId]));
    for (const r of rounds) {
      const sec = bySection.get(r.answerId)!;
      const sameSectionAvailable = TERMS.filter((t) => t.sectionId === sec).length >= 4;
      if (sameSectionAvailable) expect(r.choices.every((c) => bySection.get(c.id) === sec)).toBe(true);
    }
  });
  it('masks the term and aliases in prompts', () => {
    const t = fakeTerm('x', 'Annuity', 'ann', { aliases: ['Annuity Contract'], plain: 'An annuity is the opposite. Annuities pay. The Annuity Contract is long.' });
    const m = maskTerm(t.plain, t);
    expect(m.toLowerCase()).not.toContain('annuit');
    expect(m).toContain('_____');
    for (const r of buildRounds(TERMS, 11)) expect(r.prompt.toLowerCase()).not.toContain(TERMS.find((x) => x.id === r.termId)!.term.toLowerCase());
  });
  it('returns nothing when fewer than 4 distinct terms exist', () => { expect(buildRounds(TERMS.slice(0, 3), 1)).toEqual([]); });
});

describe('terminology UI', () => {
  it('plays a round and records the attempt as a glossary attempt', async () => {
    if (content.terms.length < 4) return;
    await db.attempts.clear();
    const user = userEvent.setup();
    wrap(<TerminologyChallenge />);
    await user.click(screen.getByTestId('terminology-start'));
    const choices = screen.getAllByTestId('terminology-choice');
    expect(choices).toHaveLength(4);
    await user.click(choices[0]);
    await waitFor(async () => expect(await db.attempts.count()).toBe(1));
    const a = (await db.attempts.toArray())[0];
    expect(a.mode).toBe('glossary');
    expect(a.questionId.startsWith('term:')).toBe(true);
    expect(a.concepts).toEqual([a.questionId.slice(5)]);
    expect(a.confidence).toBeNull();
    if (!a.correct) expect(a.confusedWith).toBe(a.choiceId);
    expect(screen.getByTestId('terminology-next')).toBeInTheDocument();
  });
});

describe('beneficiary helpers', () => {
  it('compares predictions per person within $1', () => {
    const actual = [{ name: 'Ann', amount: 50000 }, { name: 'Bob', amount: 50000 }];
    expect(comparePrediction({ Ann: 50000, Bob: 50000.5 }, actual).allCorrect).toBe(true);
    const r = comparePrediction({ Ann: 100000 }, actual);
    expect(r.allCorrect).toBe(false);
    expect(r.rows.find((x) => x.name === 'Bob')).toMatchObject({ predicted: 0, actual: 50000, match: false });
    expect(sumPayouts(actual)).toBe(100000);
  });
});

describe('scenarios home', () => {
  it('lists six scenarios with links', () => {
    wrap(<ScenariosHome />);
    for (const id of ['life-selection', 'deductible', 'beneficiary', 'policy-timeline', 'compliance', 'terminology'])
      expect(screen.getByTestId(`scenario-${id}`)).toHaveAttribute('href', `/scenarios/${id}`);
  });
});
