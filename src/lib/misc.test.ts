import { describe, it, expect } from 'vitest';
import { shuffle, rngFrom } from './rng';
import { choiceOrder, topicQuiz, mixedQuiz, weaknessDrill, rapidFire, trickyQuestions } from './selection';
import { gradeExplanation, conceptRubric } from './rubric';
import { computeCosts } from './medicalCost';
import { conceptMastery } from './mastery';

const q = (id: string, sectionId: string, extra: Partial<{ concepts: string[]; difficulty: 1 | 2 | 3; style: string; tags: string[]; stem: string }> = {}) => ({
  id, sectionId, concepts: ['c-' + sectionId], difficulty: 2 as const, style: 'concept', tags: [] as string[], stem: 'Stem?', ...extra,
});
const H = { exposure: {}, missed: {}, lastSeen: {} };

describe('answer shuffling', () => {
  it('is a permutation, deterministic per seed, and varies across seeds', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const o = choiceOrder(ids, 'q1:attempt1');
    expect([...o].sort()).toEqual(ids);
    expect(choiceOrder(ids, 'q1:attempt1')).toEqual(o);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => choiceOrder(ids, i).join('')));
    expect(seen.size).toBeGreaterThan(5);
  });
  it('correct answer position is roughly uniform', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[choiceOrder(['a', 'b', 'c', 'd'], i).indexOf('a')]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });
  it('shuffle does not mutate input', () => {
    const a = [1, 2, 3];
    shuffle(a, rngFrom(1));
    expect(a).toEqual([1, 2, 3]);
  });
});

describe('question selection', () => {
  const pool = [...Array.from({ length: 10 }, (_, i) => q(`a${i}`, 'gen')), ...Array.from({ length: 10 }, (_, i) => q(`b${i}`, 'lpr'))];
  it('topic quiz uses only chosen sections and no duplicates', () => {
    const r = topicQuiz(pool, ['gen'], 5, 1, H);
    expect(r).toHaveLength(5);
    expect(r.every((x) => x.sectionId === 'gen')).toBe(true);
    expect(new Set(r.map((x) => x.id)).size).toBe(5);
  });
  it('topic quiz returns what exists when asking for more', () => {
    expect(topicQuiz(pool, ['gen'], 50, 1, H)).toHaveLength(10);
  });
  it('mixed quiz follows weights and back-fills', () => {
    const r = mixedQuiz(pool, [{ id: 'gen', weightPct: 50 }, { id: 'lpr', weightPct: 50 }], 10, 3, H);
    expect(r).toHaveLength(10);
    expect(r.filter((x) => x.sectionId === 'gen')).toHaveLength(5);
    const r2 = mixedQuiz(pool, [{ id: 'gen', weightPct: 90 }, { id: 'lpr', weightPct: 10 }], 16, 3, H);
    expect(r2).toHaveLength(16);
    expect(new Set(r2.map((x) => x.id)).size).toBe(16);
  });
  it('weakness drill prioritizes missed questions and weak concepts', () => {
    const NOW = Date.now();
    const m = new Map([['c-gen', conceptMastery('c-gen', [{ concept: 'c-gen', at: NOW, correct: false, source: 'question' }, { concept: 'c-gen', at: NOW, correct: false, source: 'question' }], NOW)]]);
    const r = weaknessDrill(pool, m, 3, 1, { ...H, missed: { b4: 2 } });
    expect(r[0].question.id).toBe('b4');
    expect(r[0].reason).toMatch(/missed this question 2 times/);
    expect(r.slice(1).every((x) => x.question.sectionId === 'gen')).toBe(true);
  });
  it('rapid fire and tricky filters', () => {
    const p = [q('r1', 'gen', { tags: ['rapid'] }), q('t1', 'gen', { tags: ['tricky'] }), q('n1', 'gen', { difficulty: 3 }), q('x', 'gen', { stem: 'x'.repeat(300) })];
    expect(rapidFire(p, 10, 1, H).map((x) => x.id)).toEqual(['r1']);
    expect(trickyQuestions(p, 10, 1, H).map((x) => x.id).sort()).toEqual(['n1', 't1']);
  });
});

describe('explanation rubric', () => {
  it('matches key points case-insensitively', () => {
    const r = gradeExplanation('The policy is still IN FORCE during the 31-day grace period, minus the unpaid premium.', [
      { label: 'grace', anyOf: ['grace'] },
      { label: 'in force', anyOf: ['in force'] },
      { label: 'deduct', anyOf: ['deduct', 'minus'] },
      { label: 'lapse', anyOf: ['lapse'] },
    ]);
    expect(r.matched).toEqual(['grace', 'in force', 'deduct']);
    expect(r.missing).toEqual(['lapse']);
    expect(r.score).toBe(0.75);
  });
  it('short keywords match whole words only', () => {
    expect(gradeExplanation('the hmo plan', [{ label: 'PPO', anyOf: ['ppo'] }]).score).toBe(0);
    expect(gradeExplanation('a PPO plan', [{ label: 'PPO', anyOf: ['ppo'] }]).score).toBe(1);
  });
  it('builds a fallback rubric from concepts', () => {
    expect(conceptRubric([{ term: 'Grace Period' }])[0].anyOf).toContain('Grace Period');
  });
});

describe('medical cost calculator', () => {
  const plan = { deductible: 1000, coinsurancePct: 20, outOfPocketMax: 3000, copayCountsTowardOOP: true };
  it('deductible then coinsurance', () => {
    const r = computeCosts(plan, [{ label: 'Surgery', amount: 5000 }]);
    expect(r.lines[0]).toMatchObject({ deductible: 1000, coinsurance: 800, patientTotal: 1800, insurerPays: 3200 });
  });
  it('out-of-pocket maximum caps patient cost', () => {
    const r = computeCosts(plan, [{ label: 'Hospital', amount: 20000 }]);
    expect(r.patientTotal).toBe(3000);
    expect(r.insurerTotal).toBe(17000);
    expect(r.lines[0].capped).toBe(true);
  });
  it('deductible carries across bills and copays apply first', () => {
    const r = computeCosts(plan, [{ label: 'Visit', amount: 200, copay: 30 }, { label: 'MRI', amount: 2000 }]);
    expect(r.lines[0]).toMatchObject({ copay: 30, deductible: 170, coinsurance: 0, patientTotal: 200 });
    expect(r.lines[1]).toMatchObject({ deductible: 830, coinsurance: 234, patientTotal: 1064 });
    expect(r.patientTotal).toBe(1264);
    expect(r.deductibleMet).toBe(1000);
  });
  it('after the OOP max is met the insurer pays 100%', () => {
    const r = computeCosts(plan, [{ label: 'A', amount: 20000 }, { label: 'B', amount: 5000 }]);
    expect(r.lines[1].patientTotal).toBe(0);
    expect(r.lines[1].insurerPays).toBe(5000);
  });
  it('copays outside the OOP max are still charged', () => {
    const r = computeCosts({ ...plan, copayCountsTowardOOP: false }, [{ label: 'A', amount: 20000 }, { label: 'Visit', amount: 100, copay: 25 }]);
    expect(r.lines[1].patientTotal).toBe(25);
  });
});
