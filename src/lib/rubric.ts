/** "Explain your answer" grading — keyword/phrase rubric, no language model required. */
export interface RubricPoint { label: string; anyOf: string[] }
export interface RubricResult { matched: string[]; missing: string[]; score: number }

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%$' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function gradeExplanation(text: string, points: RubricPoint[]): RubricResult {
  const t = ` ${normalize(text)} `;
  const matched: string[] = [], missing: string[] = [];
  for (const p of points) {
    const hit = p.anyOf.some((k) => {
      const nk = normalize(k);
      return nk.length > 0 && t.includes(nk.length <= 3 ? ` ${nk} ` : nk);
    });
    (hit ? matched : missing).push(p.label);
  }
  return { matched, missing, score: points.length ? matched.length / points.length : 0 };
}

/** Fallback rubric built from the question's concept term names when a question has no authored rubric. */
export function conceptRubric(concepts: { term: string; aliases?: string[] }[]): RubricPoint[] {
  return concepts.map((c) => ({
    label: `Mentions the concept: ${c.term}`,
    anyOf: [c.term.replace(/\s*\(.*?\)\s*/g, '').trim(), ...(c.aliases ?? [])],
  }));
}
