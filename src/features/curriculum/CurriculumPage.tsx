import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, BookOpen, ArrowRight } from 'lucide-react';
import { content } from '@/content';
import { useLearnerModel } from '@/db/learnerModel';
import { useStudyTimer } from '@/db/hooks';
import { PageHeader, EmptyState } from '@/components/ui/misc';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { OutlineTree } from './OutlineTree';
import { approxExamQuestions, coverageSummary, outlineCoverage } from './helpers';
import type { SectionStat } from '@/lib/readiness';
import { DOMAIN_LABEL, type Domain } from '@/features/dictionary/termHelpers';

const DOMAIN_ORDER: Domain[] = ['general', 'life', 'health', 'property'];

export default function CurriculumPage() {
  useStudyTimer('lesson');
  const model = useLearnerModel();
  const statBy = new Map((model?.sectionStats ?? []).map((s) => [s.id, s]));
  const done = model?.curriculum.done ?? 0;
  const total = content.lessons.length;

  return (
    <div>
      <PageHeader
        title="Learning curriculum"
        description={`The ${content.sections.length} official sections of the ${content.manifest.series} outline, grouped by domain. Section weights show how much of the exam each one is worth.`}
        actions={model?.nextLesson ? (
          <ButtonLink to={`/lesson/${model.nextLesson.id}`} data-testid="continue-learning">
            {done > 0 ? 'Continue' : 'Start'}: {model.nextLesson.title}<ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        ) : undefined}
      />

      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between text-sm"><span className="font-medium">Lessons completed</span><span className="tabular-nums text-muted">{done} of {total}</span></div>
        <Progress value={done} max={Math.max(total, 1)} label="Lessons completed" tone="success" />
        {total === 0 && <p className="mt-2 text-sm text-muted">Lessons are still being written. The outline below shows everything the exam covers.</p>}
      </div>

      {content.sections.length === 0 ? (
        <EmptyState title="No curriculum loaded">The exam outline could not be loaded.</EmptyState>
      ) : (
        DOMAIN_ORDER.map((d) => {
          const secs = content.sections.filter((s) => s.domain === d);
          if (!secs.length) return null;
          const weight = secs.reduce((a, s) => a + s.weightPct, 0);
          return (
            <section key={d} aria-labelledby={`dom-${d}`} className="mb-8">
              <h2 id={`dom-${d}`} className="mb-3 flex items-baseline gap-2 text-lg font-bold">
                {DOMAIN_LABEL[d]}<span className="text-sm font-normal text-muted">{weight}% of the exam · {secs.length} sections</span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {secs.map((s) => <SectionCard key={s.id} id={s.id} stat={statBy.get(s.id)} />)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function SectionCard({ id, stat }: { id: string; stat: SectionStat | undefined }) {
  const s = content.sectionById.get(id as never)!;
  const [open, setOpen] = useState(false);
  const lessons = content.lessonsBySection.get(s.id) ?? [];
  const lessonsDone = stat?.lessonsDone ?? 0;
  const mastery = stat ? Math.round(stat.mastery * 100) : null;
  const started = !!stat && (stat.coverage > 0 || stat.answered > 0);
  const cov = open ? coverageSummary(outlineCoverage(s.outline, content.lessonsByOutline)) : null;
  return (
    <Card className="flex flex-col" data-testid="section-card">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug"><Link to={`/learn/${s.id}`} className="hover:text-primary hover:underline">{s.name}</Link></h3>
          <Badge tone="primary" className="shrink-0">{s.weightPct}%</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">≈ {approxExamQuestions(s.weightPct)} of {content.manifest.exam.questionCount} exam questions</p>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Lessons</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{lessons.length ? `${lessonsDone} / ${lessons.length}` : 'Coming soon'}</dd>
            {lessons.length > 0 && <Progress className="mt-1.5" value={lessonsDone} max={lessons.length} label={`${s.shortName} lessons completed`} tone="success" />}
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Mastery</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{started && mastery !== null ? `${mastery}%` : 'Not started'}</dd>
            <Progress className="mt-1.5" value={mastery ?? 0} label={`${s.shortName} mastery`} tone={mastery !== null && mastery >= 70 ? 'success' : 'primary'} />
          </div>
        </dl>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
        <ButtonLink to={`/learn/${s.id}`} size="sm"><BookOpen className="h-4 w-4" aria-hidden />Open section</ButtonLink>
        <button type="button" aria-expanded={open} aria-controls={`outline-${s.id}`} onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-2" data-testid="outline-toggle">
          Official outline<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <div id={`outline-${s.id}`} className="border-t border-border bg-surface-2/40 p-4 sm:p-5">
          {cov && <p className="mb-3 text-sm text-muted">{cov.covered} of {cov.total} outline items are covered by a lesson.</p>}
          <OutlineTree nodes={s.outline} />
        </div>
      )}
    </Card>
  );
}
