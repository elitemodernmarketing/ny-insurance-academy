import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Circle, Clock, Layers, Lightbulb, ListChecks, Plus, Puzzle, Sparkles, Target, Trophy } from 'lucide-react';
import { content } from '@/content';
import type { Lesson } from '@/content/schema';
import { useSettings, useStudyTimer } from '@/db/hooks';
import { addToDeck, updateSettings } from '@/db/repo';
import { PageHeader, EmptyState, Callout } from '@/components/ui/misc';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Progress } from '@/components/ui/Progress';
import { Markdown, TermLink, plainText } from '@/components/ui/Markdown';
import { SpeakButton } from '@/components/ui/Speak';
import { SourceList, VerificationBadge } from '@/components/ui/Verification';
import { LessonActivity } from './Activity';
import { KnowledgeChecks, KeyTermFlashcards, LessonQuiz } from './LessonSections';
import { useLessonProgress } from './useLessonProgress';
import { canComplete, lessonStatus, STATUS_LABEL, withPartViewed } from './helpers';
import { getTerm } from '@/features/dictionary/termHelpers';

export default function LessonPage() {
  const { lessonId = '' } = useParams();
  const lesson = useMemo(() => content.lessons.find((l) => l.id === lessonId), [lessonId]);
  if (!lesson)
    return (
      <EmptyState title="Lesson not found" action={<ButtonLink to="/learn" variant="outline">Back to curriculum</ButtonLink>}>
        There is no published lesson called “{lessonId}”.
      </EmptyState>
    );
  return <LessonView key={lesson.id} lesson={lesson} />;
}

function Block({ id, title, icon, children, testId }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <Card>
        <CardHeader title={<span id={id} className="flex items-center gap-2">{icon}{title}</span>} />
        <CardBody>{children}</CardBody>
      </Card>
    </section>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  useStudyTimer('lesson');
  const settings = useSettings();
  const section = content.sectionById.get(lesson.sectionId);
  const { row, patch } = useLessonProgress(lesson.id, lesson.sectionId);
  const status = lessonStatus(row);
  const completed = status === 'completed';

  const [viewed, setViewed] = useState<number[]>([]);
  const [kc, setKc] = useState({ answered: 0, correct: 0 });
  const [deckMsg, setDeckMsg] = useState('');
  const [completeMsg, setCompleteMsg] = useState('');
  const sentinels = useRef<(HTMLDivElement | null)[]>([]);

  // Seed from saved progress.
  useEffect(() => {
    if (row?.partsViewed?.length) setViewed((v) => row.partsViewed.reduce(withPartViewed, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.partsViewed.join(',')]);

  // Track which parts the learner has scrolled through.
  const partCount = lesson.parts.length;
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setViewed(Array.from({ length: partCount }, (_, i) => i)); return; }
    const io = new IntersectionObserver((entries) => {
      const seen: number[] = [];
      for (const e of entries) {
        const idx = Number((e.target as HTMLElement).dataset.part);
        const above = e.rootBounds ? e.boundingClientRect.top < e.rootBounds.top : e.boundingClientRect.top < 0;
        if (e.isIntersecting || above) seen.push(idx);
      }
      if (seen.length) setViewed((v) => seen.reduce(withPartViewed, v));
    });
    sentinels.current.forEach((el) => el && io.observe(el));
    // Fallback for fast scrolling / End key: IntersectionObserver may skip a sentinel the reader jumped past.
    let raf = 0;
    const check = () => {
      raf = 0;
      const seen: number[] = [];
      sentinels.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= window.innerHeight) seen.push(i); });
      if (seen.length) setViewed((v) => (seen.every((i) => v.includes(i)) ? v : seen.reduce(withPartViewed, v)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [partCount]);

  // Persist newly viewed parts.
  useEffect(() => {
    if (!viewed.length) return;
    void patch((cur) => (viewed.every((i) => cur.partsViewed.includes(i)) ? null : { partsViewed: viewed.reduce(withPartViewed, cur.partsViewed) }));
  }, [viewed, patch]);

  // Persist knowledge-check counts.
  useEffect(() => {
    if (kc.answered === 0) return;
    void patch((cur) => (cur.kcCorrect === kc.correct && cur.kcTotal === lesson.knowledgeChecks.length ? null : { kcCorrect: kc.correct, kcTotal: lesson.knowledgeChecks.length }));
  }, [kc, patch, lesson.knowledgeChecks.length]);

  const allViewed = viewed.length >= partCount;
  const ready = canComplete(viewed, partCount, kc.answered, lesson.knowledgeChecks.length);
  const keyTerms = lesson.keyTerms.map(getTerm).filter((t): t is NonNullable<typeof t> => !!t);
  const idx = content.lessons.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? content.lessons[idx - 1] : undefined;
  const next = idx >= 0 && idx < content.lessons.length - 1 ? content.lessons[idx + 1] : undefined;
  const related = lesson.related.map((id) => content.lessons.find((l) => l.id === id)).filter((l): l is Lesson => !!l);
  const simple = settings.teachMeNew;

  const complete = async () => {
    await patch(() => ({ status: 'completed', completedAt: Date.now() }));
    setCompleteMsg('Lesson marked complete. Nice work!');
  };

  return (
    <article className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <Link to="/learn" className="text-primary hover:underline">Curriculum</Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        <Link to={`/learn/${lesson.sectionId}`} className="text-primary hover:underline">{section?.shortName ?? lesson.sectionId}</Link>
      </nav>

      <PageHeader eyebrow={`Lesson ${lesson.order}`} title={lesson.title} />
      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={completed ? 'success' : status === 'in-progress' ? 'primary' : 'neutral'} data-testid="lesson-status">{STATUS_LABEL[status]}</Badge>
        <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-4 w-4" aria-hidden />About {lesson.estMinutes} min</span>
        {lesson.nySpecific && <Badge tone="primary">NY law</Badge>}
        <VerificationBadge v={lesson.verification} nySpecific={lesson.nySpecific} />
      </div>

      <Card className="mb-4 px-4 py-2 sm:px-5">
        <Switch
          checked={simple}
          onCheckedChange={(v) => void updateSettings({ teachMeNew: v })}
          label="Teach Me Like I’m New"
          description="Show plain-language versions of each part where available."
        />
      </Card>

      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Your progress</span><span className="tabular-nums text-muted" data-testid="lesson-progress-text">{Math.min(viewed.length, partCount)}/{partCount} parts read · {kc.answered}/{lesson.knowledgeChecks.length} checks answered</span></div>
        <Progress value={Math.min(viewed.length, partCount) + kc.answered} max={partCount + lesson.knowledgeChecks.length} label="Lesson progress" tone="success" />
      </div>

      <div className="space-y-5">
        <section aria-labelledby="intro-h">
          <Card>
            <CardHeader title={<span id="intro-h" className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" aria-hidden />Introduction</span>} action={<SpeakButton text={plainText(lesson.intro)} label="Read introduction aloud" />} />
            <CardBody>
              <Markdown text={lesson.intro} />
              <h3 className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Learning objectives</h3>
              <p className="mb-1 text-sm text-muted">By the end of this lesson you should be able to:</p>
              <ul className="list-disc space-y-1 pl-6 text-sm leading-6" data-testid="objectives">
                {lesson.objectives.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </CardBody>
          </Card>
        </section>

        <Block id="terms-h" title="Key terms" icon={<Layers className="h-4 w-4 text-primary" aria-hidden />} testId="key-terms">
          <div className="flex flex-wrap gap-2">
            {lesson.keyTerms.map((id) => (
              <span key={id} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm"><TermLink id={id} /></span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={keyTerms.length === 0} data-testid="add-all-terms"
              onClick={async () => { const n = await addToDeck(keyTerms.map((t) => t.id), 'lesson'); setDeckMsg(n > 0 ? `Added ${n} card${n === 1 ? '' : 's'} to your flashcards.` : 'All key terms are already in your flashcards.'); }}>
              <Plus className="h-4 w-4" aria-hidden />Add all key terms to flashcards
            </Button>
            <span role="status" aria-live="polite" className="text-sm text-muted">{deckMsg}</span>
          </div>
        </Block>

        {lesson.parts.map((part, i) => {
          const useSimple = simple && !!part.simple;
          const text = useSimple ? part.simple! : part.body;
          return (
            <section key={i} aria-labelledby={`part-${i}`} data-testid="lesson-part">
              <Card>
                <CardHeader
                  title={<span id={`part-${i}`}><span className="mr-2 text-muted">{i + 1}.</span>{part.heading}</span>}
                  action={<SpeakButton text={`${part.heading}. ${plainText(text)}`} label={`Read “${part.heading}” aloud`} />}
                />
                <CardBody>
                  {useSimple && <Badge tone="accent" className="mb-2"><Sparkles className="h-3 w-3" aria-hidden />Simplified</Badge>}
                  <Markdown text={text} />
                  {part.example && (
                    <div className="my-3 rounded-lg border border-border bg-surface-2 p-3" data-testid="lesson-example">
                      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-accent" aria-hidden />Example: {part.example.title}</div>
                      <Markdown text={part.example.body} className="text-sm" />
                    </div>
                  )}
                  {part.callouts.map((c, ci) => (
                    <Callout key={ci} kind={c.kind} footer={c.sources?.length ? <SourceList ids={c.sources} /> : undefined}>
                      <Markdown text={c.text} />
                    </Callout>
                  ))}
                  {part.advanced && (
                    <details className="mt-3 rounded-lg border border-border bg-surface p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary">Go deeper</summary>
                      <Markdown text={part.advanced} className="mt-2 text-sm" />
                    </details>
                  )}
                </CardBody>
              </Card>
              <div ref={(el) => { sentinels.current[i] = el; }} data-part={i} aria-hidden className="h-px" />
            </section>
          );
        })}

        <Block id="activity-h" title="Practice activity" icon={<Puzzle className="h-4 w-4 text-primary" aria-hidden />} testId="lesson-activity">
          {row?.activityDone && <Badge tone="success" className="mb-3"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed before</Badge>}
          <LessonActivity activity={lesson.activity} lessonId={lesson.id} onSolved={() => void patch(() => ({ activityDone: true }))} />
        </Block>

        <Block id="kc-h" title="Knowledge checks" icon={<ListChecks className="h-4 w-4 text-primary" aria-hidden />} testId="knowledge-checks">
          <KnowledgeChecks lesson={lesson} onChange={setKc} />
        </Block>

        <Block id="summary-h" title="Summary" icon={<Target className="h-4 w-4 text-primary" aria-hidden />} testId="lesson-summary">
          <ul className="list-disc space-y-1.5 pl-6 leading-7">{lesson.summary.map((s, i) => <li key={i}><Markdown text={s} className="[&_p]:mb-0" /></li>)}</ul>
        </Block>

        <Block id="review-h" title="Quick review: key terms" icon={<Layers className="h-4 w-4 text-primary" aria-hidden />} testId="term-review">
          <KeyTermFlashcards terms={keyTerms} />
        </Block>

        <Block id="quiz-h" title="End-of-lesson quiz" icon={<Trophy className="h-4 w-4 text-primary" aria-hidden />} testId="end-quiz">
          <LessonQuiz lesson={lesson} onFinish={(pct) => void patch((cur) => ({ quizBest: Math.max(cur.quizBest ?? 0, pct) }))} />
          {row?.quizBest != null && <p className="mt-3 text-sm text-muted">Best score on this lesson’s quiz: {Math.round(row.quizBest)}%</p>}
        </Block>

        <Card className="p-4 sm:p-5" data-testid="complete-card">
          {completed ? (
            <div className="flex flex-wrap items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
              <div className="flex-1"><div className="font-semibold">Lesson completed</div><div className="text-sm text-muted">You can revisit it any time.</div></div>
              <Button disabled data-testid="lesson-complete" variant="success"><CheckCircle2 className="h-4 w-4" aria-hidden />Completed</Button>
            </div>
          ) : (
            <div>
              <ul className="mb-3 space-y-1 text-sm" aria-label="Requirements to complete this lesson">
                <Req ok={allViewed}>Read every part ({Math.min(viewed.length, partCount)}/{partCount})</Req>
                <Req ok={kc.answered >= lesson.knowledgeChecks.length}>Answer all knowledge checks ({kc.answered}/{lesson.knowledgeChecks.length})</Req>
              </ul>
              <Button onClick={() => void complete()} disabled={!ready} data-testid="lesson-complete"><CheckCircle2 className="h-4 w-4" aria-hidden />Mark lesson complete</Button>
            </div>
          )}
          <div role="status" aria-live="polite" className="mt-2 text-sm text-success">{completeMsg}</div>
        </Card>

        <nav aria-label="Previous and next lesson" className="flex items-stretch justify-between gap-3">
          {prev ? (
            <Link to={`/lesson/${prev.id}`} className="flex max-w-[48%] flex-col rounded-xl border border-border bg-surface p-3 text-sm hover:bg-surface-2" data-testid="prev-lesson">
              <span className="flex items-center gap-1 text-xs text-muted"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Previous lesson</span><span className="font-medium">{prev.title}</span>
            </Link>
          ) : <span />}
          {next ? (
            <Link to={`/lesson/${next.id}`} className="flex max-w-[48%] flex-col items-end rounded-xl border border-border bg-surface p-3 text-right text-sm hover:bg-surface-2" data-testid="next-lesson">
              <span className="flex items-center gap-1 text-xs text-muted">Next lesson<ArrowRight className="h-3.5 w-3.5" aria-hidden /></span><span className="font-medium">{next.title}</span>
            </Link>
          ) : <span />}
        </nav>

        {related.length > 0 && (
          <Block id="related-h" title="Related lessons" icon={<BookOpen className="h-4 w-4 text-primary" aria-hidden />}>
            <ul className="space-y-1">{related.map((l) => <li key={l.id}><Link to={`/lesson/${l.id}`} className="text-primary hover:underline">{l.title}</Link></li>)}</ul>
          </Block>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <SourceList ids={lesson.sources} />
          <VerificationBadge v={lesson.verification} nySpecific={lesson.nySpecific} />
        </div>
      </div>
    </article>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <Circle className="h-4 w-4 text-muted" aria-hidden />}
      <span className={ok ? 'text-fg' : 'text-muted'}>{children}</span>
      <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
    </li>
  );
}
