import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, ListChecks, Shuffle, Crosshair, Zap, AlertTriangle, MessageSquareText, Play, Trash2, RotateCcw, Info } from 'lucide-react';
import { content } from '@/content';
import { db } from '@/db/db';
import { questionHistory, type QuestionHistory } from '@/db/repo';
import { useLearnerModel } from '@/db/learnerModel';
import { newSeed } from '@/lib/rng';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, PageHeader, Spinner, TextField } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { bankSizeBySection } from './bank';
import {
  COUNT_PRESETS, DEFAULT_COUNT, MAX_COUNT, MODE_META, SETUP_MODES, answeredCount, defaultConfig, discardSession, isSetupMode,
  selectQuestions, startPracticeFromSelection, type Difficulty, type PracticeConfig, type SetupMode,
} from './practiceService';
import { snippet } from './parts';

const ICONS: Record<SetupMode, typeof ListChecks> = {
  learn: BookOpenCheck, topic: ListChecks, mixed: Shuffle, weakness: Crosshair, rapid: Zap, tricky: AlertTriangle, explain: MessageSquareText,
};
const DIFF_LABEL: Record<Difficulty, string> = { 1: 'Foundational', 2: 'Intermediate', 3: 'Advanced' };

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function PracticeHome() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const model = useLearnerModel();
  const [history, setHistory] = useState<QuestionHistory | null>(null);
  const [seed, setSeed] = useState(() => newSeed());
  const [mode, setMode] = useState<SetupMode | null>(null);
  const [cfg, setCfg] = useState<PracticeConfig>(() => defaultConfig('topic', newSeed()));
  const [preset, setPreset] = useState<number | 'custom'>(10);
  const [custom, setCustom] = useState('15');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => { let live = true; void questionHistory().then((h) => { if (live) setHistory(h); }); return () => { live = false; }; }, []);

  // Query params preselect the mode (and section for topic quizzes).
  const modeParam = params.get('mode');
  const sectionParam = params.get('section');
  useEffect(() => {
    if (isSetupMode(modeParam)) {
      setMode(modeParam);
      setPreset(DEFAULT_COUNT[modeParam]);
      setCfg((c) => ({ ...c, sectionIds: sectionParam && content.sectionById.has(sectionParam as never) ? [sectionParam] : [] }));
    }
  }, [modeParam, sectionParam]);

  const inProgress = useLiveQuery(() => db.practiceSessions.where('status').equals('in-progress').reverse().sortBy('updatedAt').then((r) => r.filter((x) => (x.track ?? 'ny-17-55') === content.manifest.id)), []);
  const sizes = useMemo(() => bankSizeBySection(), []);
  const totalBank = content.questions.length;

  const count = preset === 'custom' ? Math.max(0, Math.min(MAX_COUNT, Math.floor(Number(custom) || 0))) : preset;
  const fullCfg: PracticeConfig = { ...cfg, count, seed };

  const ctx = useMemo(() => (model && history ? { pool: content.questions, sections: content.sections, mastery: model.mastery, history } : null), [model, history]);
  const selection = useMemo(() => (ctx && mode ? selectQuestions(mode, fullCfg, ctx) : null), [ctx, mode, fullCfg.count, fullCfg.sectionIds, fullCfg.difficulty, fullCfg.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const available = useMemo(() => {
    if (!ctx) return null;
    const out = {} as Record<SetupMode, number>;
    for (const m of SETUP_MODES) out[m] = selectQuestions(m, { ...defaultConfig(m, 1), count: 1, sectionIds: [] }, ctx).available;
    out.topic = totalBank;
    return out;
  }, [ctx, totalBank]);

  function chooseMode(m: SetupMode) {
    setMode(m);
    setPreset(DEFAULT_COUNT[m]);
    setCfg((c) => ({ ...c, difficulty: [], countdownSec: 0, feedback: 'immediate' }));
    setSeed(newSeed());
    setError(null);
  }
  function toggleSection(id: string) {
    setCfg((c) => ({ ...c, sectionIds: c.sectionIds.includes(id) ? c.sectionIds.filter((x) => x !== id) : [...c.sectionIds, id] }));
  }
  function toggleDifficulty(d: Difficulty) {
    setCfg((c) => ({ ...c, difficulty: c.difficulty.includes(d) ? c.difficulty.filter((x) => x !== d) : [...c.difficulty, d].sort() as Difficulty[] }));
  }

  async function start() {
    if (!mode || !selection || selection.questions.length === 0) return;
    setStarting(true); setError(null);
    try {
      const row = await startPracticeFromSelection(mode, fullCfg, selection);
      nav(`/practice/session/${row.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the session');
      setStarting(false);
    }
  }

  const showSections = mode === 'topic' || mode === 'learn' || mode === 'explain';
  const sectionsRequired = mode === 'topic';
  const showDifficulty = mode === 'topic' || mode === 'mixed';
  const shortBy = selection ? selection.requested - selection.questions.length : 0;

  if (totalBank === 0) {
    return (
      <div>
        <PageHeader title="Practice Questions" description="Seven ways to practice with explained, source-checked questions." />
        <EmptyState title="The question bank is still being prepared" action={<ButtonLink to="/learn" variant="outline">Study lessons meanwhile</ButtonLink>}>
          No eligible practice questions are loaded yet. Questions appear here as soon as they are reviewed and verified.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practice Questions"
        description={`Seven ways to practice. ${totalBank} approved questions (verified or reviewed) are available across ${Object.values(sizes).filter(Boolean).length} of ${content.sections.length} sections.`}
      />

      {inProgress && inProgress.length > 0 && (
        <Card>
          <CardHeader title="Continue where you left off" description="Sessions you started but did not finish." />
          <CardBody>
            <ul className="divide-y divide-border">
              {inProgress.map((s) => {
                const done = answeredCount(s);
                return (
                  <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid="practice-in-progress">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                        <span>{done} of {s.questionIds.length} answered</span><span>·</span><span>updated {ago(s.updatedAt)}</span>
                      </div>
                      <Progress className="mt-2 max-w-xs" value={done} max={Math.max(1, s.questionIds.length)} label={`${s.title} progress`} />
                    </div>
                    <div className="flex gap-2">
                      <ButtonLink to={`/practice/session/${s.id}`} size="sm" data-testid="resume-practice"><RotateCcw className="h-4 w-4" aria-hidden />Resume</ButtonLink>
                      <Button size="sm" variant="outline" onClick={() => setDiscard({ id: s.id, title: s.title })} aria-label={`Discard session ${s.title}`}><Trash2 className="h-4 w-4" aria-hidden />Discard</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="modes-h">
        <h2 id="modes-h" className="mb-3 text-lg font-semibold">Choose a practice mode</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SETUP_MODES.map((m) => {
            const Icon = ICONS[m];
            const meta = MODE_META[m];
            const active = mode === m;
            const avail = available?.[m];
            return (
              <button key={m} type="button" aria-pressed={active} onClick={() => chooseMode(m)} data-testid={`mode-${m}`}
                className={cn('flex h-full flex-col rounded-xl border p-4 text-left transition-colors', active ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border bg-surface hover:border-primary/50 hover:bg-surface-2')}>
                <span className="mb-2 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
                  <span className="text-xs font-semibold text-muted">Mode {meta.letter}</span>
                </span>
                <span className="font-semibold">{meta.title}</span>
                <span className="mt-1 flex-1 text-sm text-muted">{meta.blurb}</span>
                <span className="mt-3 text-xs text-muted">{avail === undefined ? 'Checking questions…' : m === 'weakness' && avail === 0 ? 'No weaknesses detected yet' : `${avail} question${avail === 1 ? '' : 's'} available`}</span>
              </button>
            );
          })}
        </div>
      </section>

      {mode && (
        <Card data-testid="practice-setup">
          <CardHeader as="h2" title={`${MODE_META[mode].title}: set up`} description={MODE_META[mode].blurb} />
          <CardBody className="space-y-5">
            {!ctx && <Spinner label="Preparing questions" />}

            {showSections && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Sections {sectionsRequired ? '(choose at least one)' : '(optional, default: all, weighted by the exam blueprint)'}</legend>
                <div className="mb-2 flex gap-2 text-sm">
                  <Button size="sm" variant="ghost" onClick={() => setCfg((c) => ({ ...c, sectionIds: content.sections.filter((s) => sizes[s.id] > 0).map((s) => s.id) }))}>Select all</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCfg((c) => ({ ...c, sectionIds: [] }))}>Clear</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {content.sections.map((s) => {
                    const n = sizes[s.id] ?? 0;
                    const checked = cfg.sectionIds.includes(s.id);
                    return (
                      <label key={s.id} className={cn('flex items-start gap-2 rounded-lg border p-2.5 text-sm', n === 0 ? 'cursor-not-allowed border-border bg-surface-2 opacity-60' : checked ? 'cursor-pointer border-primary bg-primary/5' : 'cursor-pointer border-border hover:bg-surface-2')}>
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={checked} disabled={n === 0} onChange={() => toggleSection(s.id)} data-testid={`section-${s.id}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{s.shortName}</span>
                          <span className="block text-xs text-muted">{n === 0 ? 'No questions yet' : `${n} question${n === 1 ? '' : 's'}`} · {s.weightPct}% of exam</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="mb-1 text-sm font-medium">Number of questions</legend>
              <div className="flex flex-wrap items-center gap-2">
                {COUNT_PRESETS.map((n) => (
                  <button key={n} type="button" aria-pressed={preset === n} onClick={() => setPreset(n)}
                    className={cn('h-10 min-w-12 rounded-lg border px-3 text-sm font-medium', preset === n ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>{n}</button>
                ))}
                <button type="button" aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}
                  className={cn('h-10 rounded-lg border px-3 text-sm font-medium', preset === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>Custom</button>
                {preset === 'custom' && (
                  <div className="w-28"><TextField label="Custom count" type="number" min={1} max={MAX_COUNT} value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
                )}
              </div>
            </fieldset>

            {showDifficulty && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Difficulty (optional, none selected = all)</legend>
                <div className="flex flex-wrap gap-2">
                  {([1, 2, 3] as Difficulty[]).map((d) => (
                    <button key={d} type="button" aria-pressed={cfg.difficulty.includes(d)} onClick={() => toggleDifficulty(d)}
                      className={cn('h-10 rounded-lg border px-3 text-sm', cfg.difficulty.includes(d) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>{d} · {DIFF_LABEL[d]}</button>
                  ))}
                </div>
              </fieldset>
            )}

            {(mode === 'topic' || mode === 'mixed') && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Feedback</legend>
                <div className="flex flex-wrap gap-2">
                  {([['immediate', 'After each question'], ['end', 'At the end of the quiz']] as const).map(([v, label]) => (
                    <button key={v} type="button" aria-pressed={cfg.feedback === v} onClick={() => setCfg((c) => ({ ...c, feedback: v }))}
                      className={cn('h-10 rounded-lg border px-3 text-sm', cfg.feedback === v ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>{label}</button>
                  ))}
                </div>
              </fieldset>
            )}

            {mode === 'rapid' && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Countdown per question</legend>
                <div className="flex flex-wrap gap-2">
                  {[0, 15, 20, 30].map((s) => (
                    <button key={s} type="button" aria-pressed={cfg.countdownSec === s} onClick={() => setCfg((c) => ({ ...c, countdownSec: s }))}
                      className={cn('h-10 rounded-lg border px-3 text-sm', cfg.countdownSec === s ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface-2')}>{s === 0 ? 'Off' : `${s} s`}</button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">When the countdown ends the question is marked unanswered and counts as incorrect.</p>
              </fieldset>
            )}

            {ctx && selection && (
              <div className="rounded-lg bg-surface-2 p-3 text-sm" aria-live="polite" data-testid="practice-selection">
                {mode === 'weakness' && selection.available === 0 ? (
                  <div>
                    <p className="font-medium">No weaknesses to drill yet.</p>
                    <p className="mt-1 text-muted">The weakness drill uses your answer history. Answer a few questions in a topic or mixed quiz first; anything you miss shows up here.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => chooseMode('mixed')}>Start with Mixed Questions</Button>
                      <ButtonLink to="/review" size="sm" variant="outline">Open Weakness Review</ButtonLink>
                    </div>
                  </div>
                ) : selection.questions.length === 0 ? (
                  <p>{sectionsRequired && cfg.sectionIds.length === 0 ? 'Choose at least one section to continue.' : 'No eligible questions match these choices.'}</p>
                ) : (
                  <p>
                    <span className="font-semibold">{selection.questions.length} question{selection.questions.length === 1 ? '' : 's'}</span> ready
                    {shortBy > 0 && <span className="text-warning"> — you asked for {selection.requested}, but only {selection.available} eligible question{selection.available === 1 ? '' : 's'} match{selection.available === 1 ? 'es' : ''} these choices.</span>}
                  </p>
                )}
                {mode === 'weakness' && selection.questions.length > 0 && (
                  <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="Why these questions were chosen">
                    {selection.questions.map((q) => (
                      <li key={q.id} className="rounded-lg bg-surface p-2">
                        <div className="text-sm">{snippet(q, 100)}</div>
                        <div className="mt-0.5 text-xs text-muted">{selection.reasons[q.id]}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={start} disabled={!selection || selection.questions.length === 0 || starting} data-testid="start-practice">
                <Play className="h-4 w-4" aria-hidden />{starting ? 'Starting…' : selection && selection.questions.length ? `Start ${selection.questions.length} question${selection.questions.length === 1 ? '' : 's'}` : 'Start'}
              </Button>
              <span className="text-xs text-muted">Progress is saved after every answer.</span>
            </div>
          </CardBody>
        </Card>
      )}

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">Question bank by section ({totalBank} eligible questions)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">Eligible questions per section</caption>
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th scope="col" className="py-1 pr-3">Section</th><th scope="col" className="py-1 pr-3 text-right">Exam weight</th><th scope="col" className="py-1 text-right">Questions</th></tr></thead>
            <tbody>
              {content.sections.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-1.5 pr-3">{s.shortName}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted">{s.weightPct}%</td>
                  <td className="py-1.5 text-right tabular-nums">{sizes[s.id] ? sizes[s.id] : <Badge tone="warning">none yet</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Only reviewed or verified questions are used. New York-specific items need a primary-source check before they appear here.</p>
      </details>

      <p className="text-sm text-muted">Looking for a timed test? Try a <Link to="/exam" className="font-medium text-primary hover:underline">mock examination</Link>.</p>

      <Dialog open={!!discard} onOpenChange={(o) => { if (!o) setDiscard(null); }} title="Discard this session?"
        description={discard ? `"${discard.title}" will be removed. Answers you already gave stay in your history.` : undefined}
        footer={<>
          <Button variant="outline" onClick={() => setDiscard(null)}>Keep it</Button>
          <Button variant="danger" onClick={async () => { if (discard) await discardSession(discard.id); setDiscard(null); }} data-testid="confirm-discard">Discard session</Button>
        </>} />
    </div>
  );
}
