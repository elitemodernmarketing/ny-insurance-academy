import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, BookOpenCheck, Loader2, Send, ShieldCheck, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { db, type TutorMessageRow } from '@/db/db';
import { useSettings, useStudyTimer } from '@/db/hooks';
import { updateSettings } from '@/db/repo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader, TextField } from '@/components/ui/misc';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';
import { answerQuestion, contentContext, detectIntent, snippetText, type Doc, type Intent, type TutorAnswer } from './retrieval';
import { askOllama, buildMessages, buildSystemPrompt, describeError, extractCitations, listModels, normalizeBase, type ChatMsg, type Snippet } from './ollama';
import { SourcedCitations } from './SourcedCitations';

export const QUICK_PROMPTS = [
  'Explain insurable interest in simple English',
  'Give me an example of an aleatory contract',
  "What's the difference between HMO and PPO?",
  'Quiz me on annuities',
  'Explain this topic using an analogy',
];

const HELP_ID = 'help:ollama';

function summaryText(a: TutorAnswer): string {
  if (a.note) return a.note;
  if (a.quiz) return `Here are ${a.quiz.questions.length} ${a.quiz.sectionName} practice questions from the verified bank.`;
  return `Found ${a.terms.length} glossary term${a.terms.length === 1 ? '' : 's'} and ${a.lessons.length} lesson section${a.lessons.length === 1 ? '' : 's'} in the validated course content.`;
}

/** Latest term cited in a sourced message, for "this topic" follow-ups. */
function lastTermIn(msgs: TutorMessageRow[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.sourced) { const c = m.citations.find((x) => x.startsWith('term:')); if (c) return c.slice(5); }
  }
  return undefined;
}

export default function TutorPage() {
  useStudyTimer('other');
  const settings = useSettings();
  const messages = useLiveQuery(() => db.tutorMessages.orderBy('at').toArray(), []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'idle' | 'ai'>('idle');
  const [confirmClear, setConfirmClear] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const aiOn = settings.tutor.enabled;

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages?.length, busy]);

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy !== 'idle') return;
    setText('');
    const history = messages ?? [];
    const now = Date.now();
    await db.tutorMessages.add({ at: now, role: 'user', text: q, sourced: false, citations: [] });
    const ans = answerQuestion(q, contentContext(lastTermIn(history)));
    await db.tutorMessages.add({ at: now + 1, role: 'assistant', text: summaryText(ans), sourced: true, citations: ans.citations });
    if (!aiOn) return;

    const docs: Doc[] = [...ans.terms, ...ans.lessons].map((h) => h.doc);
    const snippets: Snippet[] = docs.map((d) => ({ id: d.id, title: d.title, text: snippetText(d) }));
    if (!snippets.length) {
      await db.tutorMessages.add({ at: Date.now(), role: 'system', text: 'No course material matched your question, so the local model was not asked. It could only guess, and guesses are not allowed here.', sourced: false, citations: [] });
      return;
    }
    setBusy('ai');
    try {
      const chat: ChatMsg[] = history.filter((m) => m.role !== 'system' && !m.sourced && m.text).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      const reply = await askOllama({ baseUrl: settings.tutor.baseUrl, model: settings.tutor.model, messages: buildMessages(buildSystemPrompt(snippets), chat, q) });
      await db.tutorMessages.add({ at: Date.now(), role: 'assistant', text: reply, sourced: false, citations: extractCitations(reply, snippets.map((s) => s.id)) });
    } catch (e) {
      await db.tutorMessages.add({ at: Date.now(), role: 'system', text: describeError(e, settings.tutor.model, normalizeBase(settings.tutor.baseUrl)), sourced: false, citations: [HELP_ID] });
    } finally { setBusy('idle'); }
  };

  const clear = async () => { await db.tutorMessages.clear(); setConfirmClear(false); };
  const list = messages ?? [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Optional" title="AI Tutor" description="Ask a question and get answers pulled straight from the validated glossary and lessons. A local AI model is optional and clearly labeled when used." />

      <div role="note" className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
        <p><strong>No account, no cloud.</strong> Sourced answers are found on this device and never leave it. The tutor only reads course content; it cannot change it. {aiOn ? 'Local AI is on: replies from the model are shown separately and are not verified.' : 'Local AI is off.'}</p>
      </div>

      <section aria-labelledby="chat-h">
        <h2 id="chat-h" className="sr-only">Conversation</h2>
        <Card>
          <CardBody className="space-y-4 pt-4 sm:pt-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick prompts">
              {QUICK_PROMPTS.map((p) => (
                <button key={p} type="button" onClick={() => void ask(p)} disabled={busy !== 'idle'} data-testid="tutor-chip"
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60">{p}</button>
              ))}
            </div>

            <div className="space-y-4" role="log" aria-live="polite" aria-label="Tutor conversation" data-testid="tutor-log">
              {messages && !list.length && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">Ask about any insurance term or topic, or tap a prompt above.</p>}
              {list.map((m, i) => <Message key={m.id ?? i} m={m} prevUser={[...list.slice(0, i)].reverse().find((x) => x.role === 'user')?.text} />)}
              {busy === 'ai' && <p className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Asking the local model ({settings.tutor.model})…</p>}
              <div ref={endRef} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="flex flex-col gap-2 sm:flex-row" aria-label="Ask the tutor">
              <label className="min-w-0 flex-1"><span className="sr-only">Your question</span>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a term or topic, e.g. “What is a free look provision?”" data-testid="tutor-input"
                  className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted" />
              </label>
              <Button type="submit" disabled={!text.trim() || busy !== 'idle'} data-testid="tutor-ask"><Send className="h-4 w-4" aria-hidden />Ask</Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted">{list.length} message{list.length === 1 ? '' : 's'} saved on this device</span>
              {confirmClear ? (
                <span className="flex items-center gap-2"><span>Delete the whole conversation?</span>
                  <Button size="sm" variant="danger" onClick={() => void clear()} data-testid="tutor-clear-confirm">Yes, clear</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmClear(false)}>Cancel</Button></span>
              ) : (
                <Button size="sm" variant="outline" disabled={!list.length} onClick={() => setConfirmClear(true)} data-testid="tutor-clear"><Trash2 className="h-4 w-4" aria-hidden />Clear history</Button>
              )}
            </div>
          </CardBody>
        </Card>
      </section>

      <LocalAiSettings />
    </div>
  );
}

function Message({ m, prevUser }: { m: TutorMessageRow; prevUser?: string }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end"><div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-fg"><span className="sr-only">You asked: </span>{m.text}</div></div>
    );
  }
  if (m.role === 'system') {
    return (
      <div role="alert" className="rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm" data-testid="tutor-error">
        <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />{m.text}</p>
        {m.citations.includes(HELP_ID) && <div className="mt-3"><SetupHelp open /></div>}
      </div>
    );
  }
  if (m.sourced) {
    const intent: Intent = prevUser ? detectIntent(prevUser) : 'explain';
    return (
      <div className="flex gap-2" data-testid="tutor-sourced">
        <span className="mt-1 rounded-full bg-success/10 p-1.5 text-success"><BookOpenCheck className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0 flex-1 space-y-2">
          <Badge tone="success"><ShieldCheck className="h-3 w-3" aria-hidden />From validated course content</Badge>
          <p className="text-sm text-muted">{m.text}</p>
          <SourcedCitations citations={m.citations} intent={intent} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2" data-testid="tutor-ai">
      <span className="mt-1 rounded-full bg-accent/10 p-1.5 text-accent"><Sparkles className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <Badge tone="warning"><Bot className="h-3 w-3" aria-hidden />AI-generated — not verified</Badge>
        <div className="whitespace-pre-wrap rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">{m.text}</div>
        {m.citations.length > 0 && <p className="text-xs text-muted">The model cited: {m.citations.map((c) => <code key={c} className="mr-1 rounded bg-surface-2 px-1">{c}</code>)}Check the sourced answer above for the verified wording.</p>}
        {m.citations.length === 0 && <p className="text-xs text-muted">The model did not cite any provided snippet. Treat this with extra caution.</p>}
      </div>
    </div>
  );
}

function SetupHelp({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-border bg-surface p-3 text-sm">
      <summary className="cursor-pointer font-medium">Local AI setup help</summary>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>Install Ollama from <span className="font-medium">ollama.com</span> (free, runs on your computer).</li>
        <li>Download a model: <code className="rounded bg-surface-2 px-1">ollama pull llama3.1</code> (use the same name you enter above).</li>
        <li>Start the server: <code className="rounded bg-surface-2 px-1">ollama serve</code> (it listens on <code className="rounded bg-surface-2 px-1">http://localhost:11434</code>).</li>
        <li>Allow this app to call it. Set <code className="rounded bg-surface-2 px-1">OLLAMA_ORIGINS</code> to this app&rsquo;s address, then restart Ollama. This app is at <code className="rounded bg-surface-2 px-1">{typeof window !== 'undefined' ? window.location.origin : 'your app origin'}</code>, so use <code className="rounded bg-surface-2 px-1">OLLAMA_ORIGINS={typeof window !== 'undefined' ? window.location.origin : '*'}</code>.</li>
        <li>Press <strong>Test connection</strong> below.</li>
      </ol>
    </details>
  );
}

function LocalAiSettings() {
  const settings = useSettings();
  const [baseUrl, setBaseUrl] = useState(settings.tutor.baseUrl);
  const [model, setModel] = useState(settings.tutor.model);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [checking, setChecking] = useState(false);
  // Pick up stored values once they load.
  const loaded = useRef(false);
  useEffect(() => { if (!loaded.current && (settings.tutor.baseUrl !== baseUrl || settings.tutor.model !== model)) { loaded.current = true; setBaseUrl(settings.tutor.baseUrl); setModel(settings.tutor.model); } }, [settings.tutor.baseUrl, settings.tutor.model]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = baseUrl !== settings.tutor.baseUrl || model !== settings.tutor.model;

  const save = async (patch: Partial<typeof settings.tutor> = {}) => { await updateSettings({ tutor: { enabled: settings.tutor.enabled, baseUrl: baseUrl.trim(), model: model.trim(), ...patch } }); };
  const test = async () => {
    setChecking(true); setStatus(null);
    try {
      const names = await listModels(baseUrl);
      const want = model.trim();
      const has = names.some((n) => n === want || n.split(':')[0] === want.split(':')[0]);
      setStatus(has ? { ok: true, msg: `Connected. Found ${names.length} model${names.length === 1 ? '' : 's'}, including "${want}".` }
        : { ok: false, msg: `Connected, but "${want}" is not installed. Installed: ${names.join(', ') || 'none'}. Run: ollama pull ${want}` });
    } catch (e) { setStatus({ ok: false, msg: describeError(e, model, normalizeBase(baseUrl)) }); }
    finally { setChecking(false); }
  };

  return (
    <Card>
      <CardHeader as="h2" title="Optional: local AI model" description="Uses Ollama running on your own computer. Off by default. Answers from the model are never mixed into the sourced answers." />
      <CardBody className="space-y-3">
        <Switch checked={settings.tutor.enabled} onCheckedChange={(v) => void save({ enabled: v })} label="Use a local AI model" description="When on, each question is also sent to your Ollama server along with the matching course snippets." />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Ollama address" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434" data-testid="tutor-baseurl" autoComplete="off" />
          <TextField label="Model name" value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3.1" data-testid="tutor-model" autoComplete="off" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={!dirty} data-testid="tutor-save">Save settings</Button>
          <Button variant="outline" onClick={() => void test()} disabled={checking} data-testid="tutor-test">{checking ? 'Testing…' : 'Test connection'}</Button>
        </div>
        <div aria-live="polite">{status && <p className={cn('text-sm', status.ok ? 'text-success' : 'text-danger')}>{status.msg}</p>}</div>
        <SetupHelp />
      </CardBody>
    </Card>
  );
}
