import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookA, BookOpen, Flame, Layers, Play, Trash2, Zap } from 'lucide-react';
import { content } from '@/content';
import { db, type CardRow } from '@/db/db';
import { removeFromDeck } from '@/db/repo';
import { useStudyTimer } from '@/db/hooks';
import { statusOf, type CardStatus } from '@/lib/srs';
import { PageHeader, EmptyState, Stat, Select } from '@/components/ui/misc';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { DOMAIN_LABEL, getTerm } from '@/features/dictionary/termHelpers';
import { AddCards } from './AddCards';
import { ReviewSession } from './ReviewSession';
import { buildReviewQueue, CARD_TYPES, formatDue, newIntroducedToday, startOfDay, type CardTypeChoice, type ReviewMode } from './cardLogic';

const LS = 'nyia.flashcards.prefs';
interface Prefs { newPerDay: number; sessionSize: number; cardType: CardTypeChoice; mode: ReviewMode }
const DEFAULT_PREFS: Prefs = { newPerDay: 10, sessionSize: 20, cardType: 'mixed', mode: 'due' };
function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(LS) ?? '{}') as Partial<Prefs>) }; } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: Prefs) { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* storage unavailable */ } }

const STATUS_TONE: Record<CardStatus, 'neutral' | 'warning' | 'info' | 'success'> = { new: 'neutral', learning: 'warning', review: 'info', mature: 'success' };
const ROW_CAP = 40;

export default function FlashcardsPage() {
  useStudyTimer('flashcards');
  const cards = useLiveQuery(() => db.cards.toArray(), []);
  const reviewsToday = useLiveQuery(() => db.cardReviews.where('at').aboveOrEqual(startOfDay(Date.now())).toArray(), []);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (patch: Partial<Prefs>) => setPrefsState((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; });
  const [sectionId, setSectionId] = useState('');
  const [domain, setDomain] = useState('');
  const [forgottenOnly, setForgottenOnly] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [session, setSession] = useState<{ ids: string[]; cardType: CardTypeChoice; snapshot: Map<string, CardRow> } | null>(null);

  const now = Date.now();
  const deck = useMemo(() => (cards ?? []).filter((c) => c.inDeck && getTerm(c.termId)), [cards]);
  const deckIds = useMemo(() => new Set(deck.map((c) => c.termId)), [deck]);
  const scoped = useMemo(() => deck.filter((c) => {
    const t = getTerm(c.termId)!;
    if (sectionId && t.sectionId !== sectionId) return false;
    if (domain && content.sectionById.get(t.sectionId)?.domain !== domain) return false;
    return true;
  }), [deck, sectionId, domain]);

  const counts = useMemo(() => {
    const c: Record<CardStatus, number> = { new: 0, learning: 0, review: 0, mature: 0 };
    for (const k of scoped) c[statusOf(k.srs)]++;
    return c;
  }, [scoped]);
  const dueNow = scoped.filter((c) => c.srs.totalReviews > 0 && c.srs.due <= now).length;
  const forgotten = scoped.filter((c) => c.srs.lapses >= 2);
  const bestStreak = scoped.reduce<CardRow | null>((b, c) => (!b || c.srs.reps > b.srs.reps ? c : b), null);
  const introduced = newIntroducedToday(deck, reviewsToday ?? []);
  const newAllowed = Math.max(0, prefs.newPerDay - introduced);

  const plan = useMemo(
    () => buildReviewQueue(scoped, { mode: prefs.mode, now, newLimit: newAllowed, sessionSize: prefs.sessionSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, prefs.mode, newAllowed, prefs.sessionSize, Math.floor(now / 60_000)],
  );

  if (session)
    return <ReviewSession ids={session.ids} cardType={session.cardType} cards={session.snapshot} onExit={() => setSession(null)} />;

  if (cards === undefined) return <div role="status" className="p-6 text-muted">Loading your deck…</div>;

  const start = () => {
    if (!plan.ids.length) return;
    setSession({ ids: plan.ids, cardType: prefs.cardType, snapshot: new Map(deck.map((c) => [c.termId, c])) });
  };

  const rows = (forgottenOnly ? forgotten : scoped).slice().sort((a, b) => b.srs.lapses - a.srs.lapses || a.srs.due - b.srs.due);
  const shownRows = showAllRows ? rows : rows.slice(0, ROW_CAP);
  const nextDue = scoped.filter((c) => c.srs.due > now).reduce<number | null>((m, c) => (m === null || c.srs.due < m ? c.srs.due : m), null);

  return (
    <div>
      <PageHeader title="Flashcards" description="Spaced-repetition review of the terms you’re learning. Viewing a card never changes its schedule — only rating it does." />

      {deck.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="Your flashcard deck is empty" icon={<Layers className="h-8 w-8" aria-hidden />}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <a href="#add-cards" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90" data-testid="empty-add-cards">Add cards by section</a>
                <ButtonLink to="/dictionary" variant="outline"><BookA className="h-4 w-4" aria-hidden />Browse the dictionary</ButtonLink>
                <ButtonLink to="/learn" variant="outline"><BookOpen className="h-4 w-4" aria-hidden />Go to lessons</ButtonLink>
              </div>
            }>
            Cards are added three ways: from lessons (“Add all key terms to flashcards”), from any dictionary term, and automatically when you miss a practice question or guess a correct one.
          </EmptyState>
        </div>
      ) : (
        <>
          <Card className="mb-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Section" value={sectionId} onChange={(e) => { setSectionId(e.target.value); setShowAllRows(false); }} data-testid="fc-section">
                <option value="">All sections</option>
                {content.sections.map((s) => <option key={s.id} value={s.id}>{s.shortName}</option>)}
              </Select>
              <Select label="Domain" value={domain} onChange={(e) => { setDomain(e.target.value); setShowAllRows(false); }}>
                <option value="">All domains</option>
                {Object.entries(DOMAIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </Card>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="deck-stats">
            <Stat label="Due now" value={dueNow} tone={dueNow > 0 ? 'primary' : undefined} />
            <Stat label="New" value={counts.new} />
            <Stat label="Learning" value={counts.learning} />
            <Stat label="Review" value={counts.review} />
            <Stat label="Mature" value={counts.mature} tone={counts.mature > 0 ? 'success' : undefined} hint="21+ day interval" />
            <Stat label="Often forgotten" value={forgotten.length} tone={forgotten.length > 0 ? 'warning' : undefined} hint="2+ lapses" />
          </div>

          <Card className="mb-6">
            <CardHeader title="Start a review" description={plan.ids.length ? `${plan.ids.length} card${plan.ids.length === 1 ? '' : 's'} ready${prefs.mode === 'due' ? ` (${plan.due} due + ${plan.fresh} new)` : ''}.` : undefined} />
            <CardBody>
              <fieldset className="mb-4">
                <legend className="mb-1 text-sm font-medium">Queue</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([['due', 'Daily review queue', 'Due cards first, then new cards up to your daily limit.', Zap], ['hardest', 'Hardest first', 'Cards with the lowest ease and most lapses.', Flame]] as const).map(([v, t, d, Icon]) => (
                    <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', prefs.mode === v ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-2')}>
                      <input type="radio" name="queue-mode" className="mt-1 accent-[rgb(var(--primary))]" checked={prefs.mode === v} onChange={() => setPrefs({ mode: v })} />
                      <span><span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" aria-hidden />{t}</span><span className="block text-xs text-muted">{d}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select label="Card type" value={prefs.cardType} onChange={(e) => setPrefs({ cardType: e.target.value as CardTypeChoice })} data-testid="card-type">
                  {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                {prefs.mode === 'due' ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">New cards per day</span>
                    <input type="number" min={0} max={200} value={prefs.newPerDay} data-testid="new-per-day"
                      onChange={(e) => setPrefs({ newPerDay: Math.max(0, Math.min(200, Math.floor(Number(e.target.value) || 0))) })}
                      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" />
                    <span className="mt-1 block text-xs text-muted">{introduced} started today · {newAllowed} left</span>
                  </label>
                ) : (
                  <Select label="Cards per session" value={String(prefs.sessionSize)} onChange={(e) => setPrefs({ sessionSize: Number(e.target.value) })}>
                    {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={start} disabled={plan.ids.length === 0} data-testid="start-review"><Play className="h-4 w-4" aria-hidden />Start review{plan.ids.length ? ` (${plan.ids.length})` : ''}</Button>
                {plan.ids.length === 0 && (
                  <p className="text-sm text-muted" role="status">
                    You’re all caught up{nextDue ? ` — next card due ${formatDue(nextDue, now)}` : ''}.
                    {prefs.mode === 'due' && counts.new + counts.learning + counts.review + counts.mature > 0 && (
                      <> Want extra practice? <button type="button" className="font-medium text-primary underline" onClick={() => setPrefs({ mode: 'hardest' })}>Try “Hardest first”</button>.</>
                    )}
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          <Card className="mb-6">
            <CardHeader title="Your cards" description={bestStreak && bestStreak.srs.reps > 0 ? `Best recall streak: ${bestStreak.srs.reps} in a row (${getTerm(bestStreak.termId)?.term}).` : 'Recall streak = consecutive successful recalls.'}
              action={<label className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={forgottenOnly} onChange={(e) => setForgottenOnly(e.target.checked)} />Often forgotten only</label>} />
            <CardBody>
              {rows.length === 0 ? <p className="text-sm text-muted">{forgottenOnly ? 'No frequently forgotten cards — nice.' : 'No cards match these filters.'}</p> : (
                <ul className="divide-y divide-border" data-testid="deck-list">
                  {shownRows.map((c) => {
                    const t = getTerm(c.termId)!;
                    const st = statusOf(c.srs);
                    return (
                      <li key={c.termId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <Link to={`/dictionary/${t.id}`} className="min-w-0 flex-1 basis-40 font-medium hover:text-primary hover:underline">{t.term}</Link>
                        <Badge tone={STATUS_TONE[st]}>{st}</Badge>
                        <span className="text-xs tabular-nums text-muted" title="Consecutive successful recalls">streak {c.srs.reps}</span>
                        <span className={cn('text-xs tabular-nums', c.srs.lapses >= 2 ? 'font-semibold text-warning' : 'text-muted')}>{c.srs.lapses} lapse{c.srs.lapses === 1 ? '' : 's'}</span>
                        <span className="text-xs text-muted">due {formatDue(c.srs.due, now)}</span>
                        <button type="button" onClick={() => void removeFromDeck(c.termId)} aria-label={`Remove ${t.term} from flashcards`} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"><Trash2 className="h-4 w-4" aria-hidden /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!showAllRows && rows.length > ROW_CAP && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllRows(true)}>Show all {rows.length} cards</Button>}
            </CardBody>
          </Card>
        </>
      )}

      <AddCards deck={deckIds} initialSection={sectionId} />
    </div>
  );
}
