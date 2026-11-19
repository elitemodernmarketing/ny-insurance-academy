import { describe, it, expect } from 'vitest';
import { allocate, assembleExam, minimumBankForFullExam } from './blueprint';
import manifest from '../../content/manifest/exam-17-55.json';
import manifestPL from '../../content/manifest/exam-17-54.json';

const sections = manifest.sections.map((s) => ({ id: s.id, weightPct: s.weightPct }));

describe('17-55 blueprint allocation', () => {
  it('official weights sum to 100%', () => {
    expect(sections.reduce((a, s) => a + s.weightPct, 0)).toBe(100);
    expect(sections).toHaveLength(18);
  });
  it('allocates exactly 150 items, each section at floor or ceil of its exact share', () => {
    for (const seed of [1, 2, 3, 'abc', 99]) {
      const a = allocate(150, sections, seed);
      expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(150);
      for (const s of sections) {
        const exact = (150 * s.weightPct) / 100;
        expect(a[s.id]).toBeGreaterThanOrEqual(Math.floor(exact));
        expect(a[s.id]).toBeLessThanOrEqual(Math.ceil(exact));
      }
    }
  });
  it('gives whole-number sections their exact count (e.g. 10% → 15, 8% → 12, 2% → 3)', () => {
    const a = allocate(150, sections, 7);
    expect(a.lpr).toBe(15);
    expect(a.lib).toBe(12);
    expect(a.lip).toBe(12);
    expect(a.tax).toBe(3);
    expect(a.qp).toBe(3);
    expect(a.gen).toBe(6);
    expect(a.ihp).toBe(6);
  });
  it('distributes the 3 half-item remainders among the six .5 sections, deterministically per seed', () => {
    const half = ['reg', 'ann', 'ls', 'ahb', 'grp', 'gov'];
    const a1 = allocate(150, sections, 42), a2 = allocate(150, sections, 42);
    expect(a1).toEqual(a2);
    const bumped = half.filter((id) => a1[id] === Math.ceil((150 * sections.find((s) => s.id === id)!.weightPct) / 100));
    expect(bumped).toHaveLength(3);
    const variants = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(allocate(150, sections, i))));
    expect(variants.size).toBeGreaterThan(1);
  });
  it('works for custom practice sizes', () => {
    for (const n of [25, 50, 100]) {
      const a = allocate(n, sections, n);
      expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(n);
    }
  });
  it('minimum bank for one full exam', () => {
    const m = minimumBankForFullExam(150, sections);
    expect(m.reg).toBe(11);
    expect(m.lpr).toBe(15);
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(153);
  });
});

describe('exam assembly', () => {
  const pool = sections.flatMap((s) => Array.from({ length: 20 }, (_, i) => ({ id: `${s.id}-q${i}`, sectionId: s.id })));
  it('builds 150 unique questions matching the allocation', () => {
    const alloc = allocate(150, sections, 5);
    const ex = assembleExam(pool, alloc, 5);
    expect(ex.questionIds).toHaveLength(150);
    expect(new Set(ex.questionIds).size).toBe(150);
    expect(ex.shortfalls).toEqual([]);
    for (const s of sections) expect(ex.questionIds.filter((id) => id.startsWith(s.id + '-')).length).toBe(alloc[s.id]);
  });
  it('reports shortfalls instead of duplicating', () => {
    const small = pool.filter((q) => !(q.sectionId === 'lpr' && Number(q.id.split('q')[1]) >= 10));
    const alloc = allocate(150, sections, 5);
    const ex = assembleExam(small, alloc, 5);
    expect(ex.shortfalls).toEqual([{ sectionId: 'lpr', required: 15, available: 10 }]);
    expect(new Set(ex.questionIds).size).toBe(ex.questionIds.length);
    expect(ex.questionIds).toHaveLength(145);
  });
  it('prefers least-exposed questions', () => {
    const alloc = { tax: 3 };
    const exposure = Object.fromEntries(pool.filter((q) => q.sectionId === 'tax').map((q, i) => [q.id, i < 17 ? 5 : 0]));
    const ex = assembleExam(pool, alloc, 9, exposure);
    expect(ex.questionIds.sort()).toEqual(['tax-q17', 'tax-q18', 'tax-q19']);
  });
});

describe('17-54 Personal Lines blueprint', () => {
  const pl = manifestPL.sections.map((x) => ({ id: x.id, weightPct: x.weightPct }));
  it('weights sum to 100% across 7 sections, exam is 100 questions / 120 minutes', () => {
    expect(pl.reduce((a, x) => a + x.weightPct, 0)).toBe(100);
    expect(pl).toHaveLength(7);
    expect(manifestPL.exam).toMatchObject({ questionCount: 100, timeLimitMinutes: 120, passingPercent: 70 });
  });
  it('allocates exactly the published percentages as item counts (no fractional sections)', () => {
    for (const seed of [1, 2, 3]) {
      const a = allocate(100, pl, seed);
      expect(a).toEqual({ plreg: 10, plgen: 10, plpc: 17, pldwl: 8, plho: 24, plauto: 24, ploth: 7 });
    }
  });
  it('minimum bank for one full exam equals the weights', () => {
    expect(minimumBankForFullExam(100, pl)).toEqual({ plreg: 10, plgen: 10, plpc: 17, pldwl: 8, plho: 24, plauto: 24, ploth: 7 });
  });
});
