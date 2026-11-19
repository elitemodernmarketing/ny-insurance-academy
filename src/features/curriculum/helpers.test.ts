import { describe, it, expect } from 'vitest';
import type { Lesson, OutlineNode, Question } from '@/content/schema';
import { approxExamQuestions, canComplete, lessonQuizPool, lessonStatus, outlineCoverage, withPartViewed } from './helpers';

const q = (id: string, outlineIds: string[], concepts: string[] = ['x']): Question => ({ id, outlineIds, concepts } as unknown as Question);
const lesson = { id: 'reg-l01', outlineIds: ['reg.1', 'reg.1.1'], keyTerms: ['producer'] };

describe('curriculum helpers', () => {
  it('approx exam questions = weight x 1.5', () => {
    expect(approxExamQuestions(10)).toBe(15);
    expect(approxExamQuestions(7)).toBe(11);
  });
  it('lesson status', () => {
    expect(lessonStatus(undefined)).toBe('not-started');
    expect(lessonStatus({ status: 'in-progress' })).toBe('in-progress');
    expect(lessonStatus({ status: 'completed' })).toBe('completed');
  });
  it('outline coverage: direct, inherited and partial', () => {
    const nodes: OutlineNode[] = [
      { id: 'a.1', title: 'A', children: [{ id: 'a.1.1', title: 'A1' }, { id: 'a.1.2', title: 'A2' }] },
      { id: 'a.2', title: 'B', children: [{ id: 'a.2.1', title: 'B1' }] },
      { id: 'a.3', title: 'C' },
    ];
    const l = { id: 'l1', order: 1 } as Lesson;
    const l2 = { id: 'l2', order: 2 } as Lesson;
    const cov = outlineCoverage(nodes, new Map([['a.1', [l]], ['a.2.1', [l2]]]));
    expect(cov.get('a.1')!.coverage).toBe('covered');
    expect(cov.get('a.1.2')!.coverage).toBe('covered'); // inherited from parent
    expect(cov.get('a.1.2')!.lessons.map((x) => x.id)).toEqual(['l1']);
    expect(cov.get('a.2')!.coverage).toBe('partial');
    expect(cov.get('a.2.1')!.coverage).toBe('covered');
    expect(cov.get('a.3')!.coverage).toBe('none');
  });
  it('lesson quiz pool prefers outline overlap (incl. descendants), then key terms, max 5, deterministic', () => {
    const bank = [
      q('reg-q001', ['reg.1.1']), q('reg-q002', ['reg.1.1.4']), q('reg-q003', ['reg.1']), q('reg-q004', ['lib.1']),
      q('reg-q005', ['reg.9'], ['producer']), q('reg-q006', ['reg.1.2'], []), q('reg-q007', ['reg.1.1'], []), q('reg-q008', ['reg.1.1'], []),
    ];
    const pool = lessonQuizPool(lesson, bank, 0, 5);
    expect(pool).toHaveLength(5);
    expect(pool.some((x) => x.id === 'reg-q004')).toBe(false);
    expect(lessonQuizPool(lesson, bank, 0, 5).map((x) => x.id)).toEqual(pool.map((x) => x.id));
    // fewer outline matches than max -> top up with key-term matches
    const small = lessonQuizPool(lesson, [q('reg-q001', ['reg.1.1']), q('reg-q005', ['reg.9'], ['producer']), q('reg-q009', ['lib.2'], ['zzz'])], 0, 5);
    expect(small.map((x) => x.id).sort()).toEqual(['reg-q001', 'reg-q005']);
    expect(lessonQuizPool(lesson, [], 0)).toEqual([]);
  });
  it('part viewed + completion gate', () => {
    expect(withPartViewed([0, 2], 1)).toEqual([0, 1, 2]);
    expect(withPartViewed([0], 0)).toEqual([0]);
    expect(canComplete([0, 1, 2], 3, 2, 2)).toBe(true);
    expect(canComplete([0, 1], 3, 2, 2)).toBe(false);
    expect(canComplete([0, 1, 2], 3, 1, 2)).toBe(false);
  });
});
