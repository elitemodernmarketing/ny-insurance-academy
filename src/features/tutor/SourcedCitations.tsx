import { Link } from 'react-router-dom';
import { BookOpen, ListChecks } from 'lucide-react';
import { content } from '@/content';
import { Markdown } from '@/components/ui/Markdown';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Intent } from './retrieval';

/** Renders validated content for citation ids. Everything is looked up live from content; nothing is stored or edited. */
export function SourcedCitations({ citations, intent }: { citations: string[]; intent: Intent }) {
  const comparison = citations.find((c) => c.startsWith('comparison:'));
  const terms = citations.filter((c) => c.startsWith('term:')).map((c) => content.termById.get(c.slice(5))).filter((t) => !!t);
  const lessons = citations.filter((c) => c.startsWith('lesson:')).map((c) => {
    const [lid, part] = c.slice(7).split('#');
    const l = content.lessonById.get(lid);
    return l ? { l, i: Number(part), p: l.parts[Number(part)] } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x && !!x.p);
  const quiz = citations.find((c) => c.startsWith('quiz:'))?.slice(5);
  const questions = citations.filter((c) => c.startsWith('question:')).map((c) => content.questionById.get(c.slice(9))).filter((q) => !!q);

  return (
    <div className="space-y-3">
      {comparison && (() => {
        const [a, b] = comparison.slice(11).split('|');
        const cmp = content.comparisons.find((c) => c.a === a && c.b === b);
        if (!cmp) return null;
        return (
          <article className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="tutor-comparison">
            <h3 className="font-semibold">{content.termById.get(a)?.term} vs {content.termById.get(b)?.term}</h3>
            <p className="mt-1">{cmp.keyDifference}</p>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[20rem] text-left text-xs">
              <thead><tr className="border-b border-border text-muted"><th className="py-1 pr-2">Aspect</th><th className="px-2">{content.termById.get(a)?.term}</th><th className="pl-2">{content.termById.get(b)?.term}</th></tr></thead>
              <tbody>{cmp.rows.map((r) => <tr key={r.aspect} className="border-b border-border/60"><th scope="row" className="py-1 pr-2 font-medium">{r.aspect}</th><td className="px-2">{r.a}</td><td className="pl-2">{r.b}</td></tr>)}</tbody></table></div>
            {cmp.memoryTip && <p className="mt-2 text-xs text-muted">Memory tip: {cmp.memoryTip}</p>}
            <Link className="mt-2 inline-block text-primary hover:underline" to={`/dictionary/compare?a=${a}&b=${b}`}>Open full comparison</Link>
          </article>
        );
      })()}

      {terms.map((t, idx) => t && (
        <article key={t.id} className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="tutor-term">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t.term}</h3>
            <Badge><BookOpen className="h-3 w-3" aria-hidden />Glossary · {content.sectionById.get(t.sectionId)?.shortName}</Badge>
          </div>
          {intent === 'analogy' && idx === 0 ? (
            <><p className="mt-1"><strong>Analogy:</strong> {t.simpler}</p><p className="mt-2 text-muted">{t.plain}</p></>
          ) : intent === 'example' ? (
            <><ul className="mt-1 list-disc space-y-1 pl-5">{t.examples.map((e) => <li key={e}>{e}</li>)}</ul><p className="mt-2 text-muted">{t.plain}</p></>
          ) : (
            <><p className="mt-1">{t.plain}</p>{idx === 0 && <p className="mt-2 rounded-md bg-surface-2 p-2"><strong>In simpler words:</strong> {t.simpler}</p>}</>
          )}
          {idx === 0 && intent === 'explain' && <p className="mt-2 text-xs text-muted"><strong>Exam tip:</strong> {t.examTip}</p>}
          <Link className="mt-2 inline-block text-primary hover:underline" to={`/dictionary/${t.id}`}>Open “{t.term}” in the dictionary</Link>
        </article>
      ))}

      {lessons.map(({ l, i, p }) => (
        <article key={`${l.id}#${i}`} className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="tutor-lesson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{p.heading}</h3>
            <Badge tone="info"><BookOpen className="h-3 w-3" aria-hidden />Lesson · {l.title}</Badge>
          </div>
          <Markdown text={p.body} className="mt-1 [&>p:last-child]:mb-0" />
          <Link className="mt-1 inline-block text-primary hover:underline" to={`/lesson/${l.id}`}>Open lesson “{l.title}”</Link>
        </article>
      ))}

      {quiz && (
        <article className="rounded-xl border border-border bg-surface p-3 text-sm" data-testid="tutor-quiz">
          <h3 className="flex items-center gap-1.5 font-semibold"><ListChecks className="h-4 w-4 text-primary" aria-hidden />{content.sectionById.get(quiz as never)?.shortName} sample questions</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">{questions.map((q) => q && <li key={q.id}>{q.stem}</li>)}</ol>
          <p className="mt-2 text-xs text-muted">Answers are hidden here on purpose. Take them as a real quiz to get feedback and track progress.</p>
          <ButtonLink to={`/practice?mode=topic&section=${quiz}`} size="sm" className="mt-3" data-testid="tutor-start-quiz">Start topic quiz</ButtonLink>
        </article>
      )}
    </div>
  );
}
