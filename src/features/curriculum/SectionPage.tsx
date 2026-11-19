import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, BookA, CheckCircle2, Circle, Clock, PlayCircle, Target, ListTree } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { useLearnerModel } from '@/db/learnerModel';
import { useStudyTimer } from '@/db/hooks';
import { PageHeader, EmptyState, Stat } from '@/components/ui/misc';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { OutlineTree } from './OutlineTree';
import { approxExamQuestions, lessonStatus, STATUS_LABEL, type LessonStatus } from './helpers';
import { DOMAIN_LABEL } from '@/features/dictionary/termHelpers';

export default function SectionPage() {
  useStudyTimer('lesson');
  const { sectionId = '' } = useParams();
  const section = content.sectionById.get(sectionId as never);
  const model = useLearnerModel();
  const progress = useLiveQuery(() => db.lessonProgress.where('sectionId').equals(sectionId).toArray(), [sectionId]);

  if (!section)
    return <EmptyState title="Section not found" action={<ButtonLink to="/learn" variant="outline">Back to curriculum</ButtonLink>}>There is no section called “{sectionId}”.</EmptyState>;

  const lessons = content.lessonsBySection.get(section.id) ?? [];
  const byLesson = new Map((progress ?? []).map((p) => [p.lessonId, p]));
  const statusOf = (id: string): LessonStatus => lessonStatus(byLesson.get(id));
  const done = lessons.filter((l) => statusOf(l.id) === 'completed').length;
  const nextLesson = lessons.find((l) => statusOf(l.id) !== 'completed');
  const inProgress = nextLesson && statusOf(nextLesson.id) === 'in-progress';
  const stat = model?.sectionStats.find((s) => s.id === section.id);
  const terms = content.termsBySection.get(section.id) ?? [];
  const idx = content.sections.findIndex((s) => s.id === section.id);
  const prev = idx > 0 ? content.sections[idx - 1] : undefined;
  const next = idx < content.sections.length - 1 ? content.sections[idx + 1] : undefined;
  const outlineName = (id: string) => content.outline.get(id)?.title ?? id;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link to="/learn" className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Curriculum</Link>
      </nav>
      <PageHeader
        eyebrow={`${DOMAIN_LABEL[section.domain]} · ${section.weightPct}% of the exam`}
        title={section.name}
        description={`About ${approxExamQuestions(section.weightPct)} of the ${content.manifest.exam.questionCount} exam questions come from this section.`}
        actions={
          <>
            {nextLesson && (
              <ButtonLink to={`/lesson/${nextLesson.id}`} data-testid="start-lesson">
                <PlayCircle className="h-4 w-4" aria-hidden />{inProgress ? 'Continue lesson' : done > 0 ? 'Next lesson' : 'Start first lesson'}
              </ButtonLink>
            )}
            <ButtonLink to={`/practice?mode=topic&section=${section.id}`} variant="outline" data-testid="topic-quiz"><Target className="h-4 w-4" aria-hidden />Topic quiz</ButtonLink>
            <ButtonLink to={`/dictionary?section=${section.id}`} variant="outline" data-testid="section-glossary"><BookA className="h-4 w-4" aria-hidden />Glossary ({terms.length})</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lessons done" value={lessons.length ? `${done}/${lessons.length}` : '—'} />
        <Stat label="Mastery" value={stat && (stat.coverage > 0 || stat.answered > 0) ? `${Math.round(stat.mastery * 100)}%` : '—'} hint="from practice & flashcards" />
        <Stat label="Accuracy" value={stat?.accuracy != null ? `${Math.round(stat.accuracy * 100)}%` : '—'} hint={stat ? `${stat.answered} answered` : undefined} />
        <Stat label="Terms" value={terms.length} hint={`${content.questionsBySection.get(section.id)?.length ?? 0} practice questions`} />
      </div>

      <section aria-labelledby="lessons-h" className="mb-8">
        <h2 id="lessons-h" className="mb-3 text-lg font-bold">Lessons</h2>
        {lessons.length === 0 ? (
          <EmptyState title="Lessons for this section are on the way" icon={<ListTree className="h-8 w-8" aria-hidden />}
            action={<div className="flex flex-wrap justify-center gap-2"><ButtonLink to={`/dictionary?section=${section.id}`} variant="outline">Browse glossary</ButtonLink><ButtonLink to={`/practice?mode=topic&section=${section.id}`} variant="outline">Topic quiz</ButtonLink></div>}>
            You can still study the official outline below, look up terms in the glossary, or practice questions from this section.
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {lessons.map((l) => {
              const st = statusOf(l.id);
              const p = byLesson.get(l.id);
              const covered = [...new Set(l.outlineIds)].filter((o) => content.outline.has(o));
              return (
                <li key={l.id}>
                  <Card data-testid="lesson-card">
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="mt-0.5 shrink-0" title={STATUS_LABEL[st]}>
                          {st === 'completed' ? <CheckCircle2 className="h-6 w-6 text-success" aria-hidden /> : st === 'in-progress' ? <PlayCircle className="h-6 w-6 text-primary" aria-hidden /> : <Circle className="h-6 w-6 text-muted" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold leading-snug"><span className="text-muted">Lesson {l.order}. </span>{l.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{l.intro}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <Badge tone={st === 'completed' ? 'success' : st === 'in-progress' ? 'primary' : 'neutral'}>{STATUS_LABEL[st]}</Badge>
                            <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" aria-hidden />{l.estMinutes} min</span>
                            <span className="text-muted">{l.keyTerms.length} key terms</span>
                            {p?.quizBest != null && <span className="text-muted">Best quiz {Math.round(p.quizBest)}%</span>}
                          </div>
                          <details className="mt-2 text-sm">
                            <summary className="cursor-pointer text-primary hover:underline">Outline items covered ({covered.length})</summary>
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                              {covered.map((o) => <li key={o} className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted" title={content.outline.get(o)?.path.join(' › ')}>{outlineName(o)}</li>)}
                            </ul>
                          </details>
                        </div>
                      </div>
                      <ButtonLink to={`/lesson/${l.id}`} size="sm" variant={st === 'completed' ? 'outline' : 'primary'} className="shrink-0" data-testid="open-lesson">
                        {st === 'completed' ? 'Review' : st === 'in-progress' ? 'Continue' : 'Start'}<ArrowRight className="h-4 w-4" aria-hidden />
                      </ButtonLink>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Card className="mb-8">
        <CardHeader title="Official exam outline" description="Items with a check are covered by at least one lesson." />
        <CardBody><OutlineTree nodes={section.outline} /></CardBody>
      </Card>

      <nav aria-label="Previous and next section" className="flex items-center justify-between gap-2">
        {prev ? <ButtonLink to={`/learn/${prev.id}`} variant="outline" size="sm"><ArrowLeft className="h-4 w-4" aria-hidden /><span className="max-w-[10rem] truncate">{prev.shortName}</span></ButtonLink> : <span />}
        {next ? <ButtonLink to={`/learn/${next.id}`} variant="outline" size="sm"><span className="max-w-[10rem] truncate">{next.shortName}</span><ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink> : <span />}
      </nav>
    </div>
  );
}
