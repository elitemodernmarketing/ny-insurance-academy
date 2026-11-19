/** Outline coverage: which official outline topics have lessons, practice questions and glossary terms. */
import type { OutlineNode } from './schema';

export interface CoverageInputs {
  sections: { id: string; name: string; weightPct: number; children: OutlineNode[] }[];
  lessons: { id: string; outlineIds: string[] }[]; // eligible only
  questions: { id: string; sectionId: string; outlineIds: string[] }[]; // eligible only
  terms: { id: string; outlineIds: string[] }[]; // eligible only
  draftQuestions?: { outlineIds: string[] }[];
}
export type CoverageStatus = 'complete' | 'partial' | 'gap';
export interface NodeCoverage {
  id: string; title: string; refs?: string; sectionId: string; depth: number; isLeaf: boolean;
  lessons: string[]; lessonViaAncestor: boolean; questions: number; terms: number; draftQuestions: number; status: CoverageStatus;
}
export interface SectionCoverage {
  id: string; name: string; weightPct: number;
  nodes: number; complete: number; partial: number; gap: number;
  eligibleQuestions: number; minForOneExam: number; targetQuestions: number; meetsFullExam: boolean;
}

export function computeCoverage(inp: CoverageInputs, examSize = 150): { nodes: NodeCoverage[]; sections: SectionCoverage[] } {
  const lessonsBy = new Map<string, string[]>();
  for (const l of inp.lessons) for (const o of l.outlineIds) lessonsBy.set(o, [...(lessonsBy.get(o) ?? []), l.id]);
  const qBy = new Map<string, number>();
  for (const q of inp.questions) for (const o of new Set(q.outlineIds)) qBy.set(o, (qBy.get(o) ?? 0) + 1);
  const dBy = new Map<string, number>();
  for (const q of inp.draftQuestions ?? []) for (const o of new Set(q.outlineIds)) dBy.set(o, (dBy.get(o) ?? 0) + 1);
  const tBy = new Map<string, number>();
  for (const t of inp.terms) for (const o of new Set(t.outlineIds)) tBy.set(o, (tBy.get(o) ?? 0) + 1);

  const nodes: NodeCoverage[] = [];
  const walk = (n: OutlineNode, sectionId: string, depth: number, ancestorLessons: string[]): { lessons: Set<string>; q: number; t: number; d: number } => {
    const own = lessonsBy.get(n.id) ?? [];
    let lessons = new Set(own), q = qBy.get(n.id) ?? 0, t = tBy.get(n.id) ?? 0, d = dBy.get(n.id) ?? 0;
    const idx = nodes.length;
    nodes.push(null as unknown as NodeCoverage);
    for (const c of n.children ?? []) {
      const r = walk(c, sectionId, depth + 1, own.length ? own : ancestorLessons);
      r.lessons.forEach((x) => lessons.add(x));
      q += r.q; t += r.t; d += r.d;
    }
    const lessonViaAncestor = lessons.size === 0 && ancestorLessons.length > 0;
    const hasLesson = lessons.size > 0 || lessonViaAncestor;
    const status: CoverageStatus = hasLesson && q > 0 ? 'complete' : hasLesson || q > 0 ? 'partial' : 'gap';
    nodes[idx] = { id: n.id, title: n.title, refs: n.refs, sectionId, depth, isLeaf: !n.children?.length, lessons: [...lessons], lessonViaAncestor, questions: q, terms: t, draftQuestions: d, status };
    lessons = new Set(lessons);
    return { lessons, q, t, d };
  };
  for (const s of inp.sections) for (const c of s.children) walk(c, s.id, 0, []);

  const totalW = inp.sections.reduce((a, s) => a + s.weightPct, 0);
  const sections: SectionCoverage[] = inp.sections.map((s) => {
    const ns = nodes.filter((n) => n.sectionId === s.id);
    const eligibleQuestions = inp.questions.filter((q) => q.sectionId === s.id).length;
    const minForOneExam = Math.ceil((examSize * s.weightPct) / totalW - 1e-9);
    return {
      id: s.id, name: s.name, weightPct: s.weightPct, nodes: ns.length,
      complete: ns.filter((n) => n.status === 'complete').length,
      partial: ns.filter((n) => n.status === 'partial').length,
      gap: ns.filter((n) => n.status === 'gap').length,
      eligibleQuestions, minForOneExam, targetQuestions: Math.max(10, s.weightPct * 4), meetsFullExam: eligibleQuestions >= minForOneExam,
    };
  });
  return { nodes, sections };
}
