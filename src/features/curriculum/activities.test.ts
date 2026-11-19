import { describe, it, expect } from 'vitest';
import { assignMatch, checkCategorize, checkMatch, checkSequence, checkTrueFalse, moveItem, shuffledPermutation } from './activities';

describe('activity checking', () => {
  it('shuffledPermutation is a permutation, deterministic and never the identity', () => {
    for (let n = 2; n <= 8; n++) {
      for (const seed of ['a', 'b', 'c', 'lpr-l01:match']) {
        const p = shuffledPermutation(n, seed);
        expect([...p].sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(p.every((v, i) => v === i)).toBe(false);
        expect(shuffledPermutation(n, seed)).toEqual(p);
      }
    }
    expect(shuffledPermutation(1, 'x')).toEqual([0]);
  });

  it('match: scores each left item and frees a right item when reassigned', () => {
    const pairs = [{ left: 'a', right: 'A' }, { left: 'b', right: 'B' }, { left: 'c', right: 'C' }];
    expect(checkMatch(pairs, [0, 1, 2]).allCorrect).toBe(true);
    const r = checkMatch(pairs, [1, 0, 2]);
    expect(r.allCorrect).toBe(false);
    expect(r.perItem).toEqual([false, false, true]);
    expect(checkMatch(pairs, [0, null, null]).correct).toBe(1);
    // assigning right #0 to left #2 removes it from left #0
    expect(assignMatch([0, null, null], 2, 0)).toEqual([null, null, 0]);
  });

  it('categorize compares chosen category text', () => {
    const items = [{ text: 'x', category: 'Life' }, { text: 'y', category: 'Health' }];
    expect(checkCategorize(items, ['Life', 'Health']).allCorrect).toBe(true);
    expect(checkCategorize(items, ['Health', null]).perItem).toEqual([false, false]);
  });

  it('sequence is correct only for the identity order', () => {
    expect(checkSequence([0, 1, 2]).allCorrect).toBe(true);
    const r = checkSequence([1, 0, 2]);
    expect(r.perItem).toEqual([false, false, true]);
    expect(moveItem([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
    expect(moveItem([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
  });

  it('true/false', () => {
    const s = [{ text: '1', answer: true, explanation: 'e' }, { text: '2', answer: false, explanation: 'e' }];
    expect(checkTrueFalse(s, [true, false]).allCorrect).toBe(true);
    expect(checkTrueFalse(s, [true, null]).correct).toBe(1);
  });
});
