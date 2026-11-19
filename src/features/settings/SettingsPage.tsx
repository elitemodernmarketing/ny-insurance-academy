import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload, Trash2, Volume2, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSettings } from '@/db/hooks';
import { updateSettings } from '@/db/repo';
import { exportData, parseBackup, importData, resetAllData, downloadJson, type Backup } from '@/db/backup';
import { setActiveTrackId } from '@/content/tracks';
import { resetOnboardingCompleted } from '@/features/onboarding/onboardingState';
import { content } from '@/content';
import { localDate } from '@/lib/dates';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, Select } from '@/components/ui/misc';
import { speak, ttsSupported } from '@/components/ui/Speak';
import { cn } from '@/components/ui/cn';

export default function SettingsPage() {
  const s = useSettings();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function onFile(f: File) {
    setMsg(null);
    try {
      const parsed = parseBackup(JSON.parse(await f.text()));
      if (!parsed.ok) { setMsg({ ok: false, text: `That file is not a valid backup: ${parsed.error}` }); return; }
      setPending(parsed.backup);
    } catch (e) {
      setMsg({ ok: false, text: `Could not read the file: ${(e as Error).message}` });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Appearance, accessibility, study preferences and your data. Everything is stored only on this device." />

      <Card>
        <CardHeader title="Learning track" description="Choose the license exam you are studying for. Your progress in each track is kept separately and is never lost when you switch." />
        <CardBody>
          <div role="radiogroup" aria-label="Learning track" className="grid gap-3 sm:grid-cols-2">
            {content.tracks.map((t) => {
              const active = t.id === content.manifest.id;
              const ready = t.counts.lessons > 0 && t.counts.questions >= t.manifest.exam.questionCount;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={active} disabled={!ready && !active} data-testid={`track-${t.series}`}
                  onClick={() => { if (!active) { void updateSettings({ track: t.id }); setActiveTrackId(t.id); } }}
                  className={cn('rounded-xl border p-4 text-left transition-colors', active ? 'border-primary bg-primary/5' : ready ? 'border-border hover:border-primary/50 hover:bg-surface-2' : 'border-dashed border-border opacity-80')}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{t.title}</div>
                    {active ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Selected</Badge> : ready ? <Badge tone="primary">Switch</Badge> : <Badge>Planned</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted">PSI Series {t.series} · {t.manifest.exam.questionCount} questions · {t.manifest.exam.timeLimitMinutes} min · {t.manifest.prelicensing.statutoryMinimumHours}-hour pre-licensing course</div>
                  <div className="mt-1 text-xs text-muted">{t.counts.lessons} lessons · {t.counts.questions} questions · {t.counts.terms} glossary terms</div>
                  {!ready && !active && <p className="mt-2 text-xs text-muted">Not available yet: not enough verified lessons and questions for a full exam.</p>}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appearance & accessibility" />
          <CardBody className="divide-y divide-border">
            <div className="pb-3">
              <Select label="Theme" value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })} data-testid="theme-select">
                <option value="system">Match my system</option><option value="light">Light</option><option value="dark">Dark</option>
              </Select>
            </div>
            <div className="py-3">
              <label className="block text-sm font-medium" htmlFor="text-scale">Text size: {Math.round(s.textScale * 100)}%</label>
              <input id="text-scale" type="range" min={0.875} max={1.5} step={0.125} value={s.textScale} onChange={(e) => updateSettings({ textScale: Number(e.target.value) })} className="mt-2 w-full accent-[rgb(var(--primary))]" />
            </div>
            <Switch label="High contrast" description="Stronger borders and pure black/white colors." checked={s.highContrast} onCheckedChange={(v) => updateSettings({ highContrast: v })} />
            <Switch label="Reduce motion" description="Turns off flip and fade animations (your system setting is also respected)." checked={s.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} />
            <Switch label="Focus mode" description="Hides the navigation sidebar to minimise distractions." checked={s.focusMode} onCheckedChange={(v) => updateSettings({ focusMode: v })} />
            <Switch label="Teach Me Like I'm New" description="Lessons show simpler explanations where available." checked={s.teachMeNew} onCheckedChange={(v) => updateSettings({ teachMeNew: v })} />
            <div className="pt-1">
              <Switch label="Read-aloud buttons (text-to-speech)" description={ttsSupported() ? 'Uses your browser’s built-in voices — works offline on most systems.' : 'Your browser does not support speech synthesis.'} checked={s.ttsEnabled && ttsSupported()} onCheckedChange={(v) => updateSettings({ ttsEnabled: v })} />
              {ttsSupported() && s.ttsEnabled && (
                <div className="flex items-center gap-3 pb-2">
                  <label className="text-sm" htmlFor="tts-rate">Speed {s.ttsRate.toFixed(1)}×</label>
                  <input id="tts-rate" type="range" min={0.6} max={1.6} step={0.1} value={s.ttsRate} onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })} className="flex-1 accent-[rgb(var(--primary))]" />
                  <Button size="sm" variant="outline" onClick={() => speak('Indemnity means putting you back where you were before a covered loss.', s.ttsRate)}><Volume2 className="h-4 w-4" aria-hidden />Test</Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Study preferences" />
          <CardBody className="space-y-4">
            <Select label="Practice target (the official passing score is 70%)" value={String(s.practiceTarget)} onChange={(e) => updateSettings({ practiceTarget: Number(e.target.value) })}>
              {[70, 75, 80, 85, 90, 95].map((p) => <option key={p} value={p}>{p}%{p === 85 ? ' (recommended buffer)' : ''}</option>)}
            </Select>
            <Select label="Daily study goal" value={String(s.dailyGoalMinutes)} onChange={(e) => updateSettings({ dailyGoalMinutes: Number(e.target.value) })}>
              {[15, 20, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </Select>
            <Select label="Prior insurance knowledge (used by the planner)" value={s.priorKnowledge} onChange={(e) => updateSettings({ priorKnowledge: e.target.value as 'none' | 'some' | 'experienced' })}>
              <option value="none">None</option><option value="some">Some</option><option value="experienced">Experienced</option>
            </Select>
            <Button variant="outline" onClick={async () => { await updateSettings({ onboardingDone: false }); resetOnboardingCompleted(); nav('/onboarding'); }}><RotateCcw className="h-4 w-4" aria-hidden />Replay onboarding & diagnostic</Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your data" description="Progress is saved automatically in this browser (IndexedDB). Export a backup to move it to another computer or browser." />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={async () => { const b = await exportData(); downloadJson(b, `ny-insurance-academy-backup-${localDate()}.json`); setMsg({ ok: true, text: 'Backup downloaded.' }); }} data-testid="export-data"><Download className="h-4 w-4" aria-hidden />Export backup (JSON)</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="import-data"><Upload className="h-4 w-4" aria-hidden />Import backup…</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose backup file" data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 className="h-4 w-4" aria-hidden />Reset all progress…</Button>
          </div>
          {msg && <p role="status" className={cn('flex items-center gap-1.5 text-sm', msg.ok ? 'text-success' : 'text-danger')}>{msg.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}{msg.text}</p>}
          <p className="text-xs text-muted">Backups contain only your progress and settings (not the course content). Content version: {content.manifest.source.checkedOn} · {content.questions.length} questions · {content.terms.length} terms · {content.lessons.length} lessons.</p>
        </CardBody>
      </Card>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Import backup?"
        description={pending ? `Exported ${new Date(pending.exportedAt).toLocaleString()} · ${Object.entries(pending.data).map(([k, v]) => `${v.length} ${k}`).filter((x) => !x.startsWith('0 ')).join(', ') || 'empty'}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
          <Button data-testid="confirm-import" onClick={async () => { if (!pending) return; const counts = await importData(pending, mode); setPending(null); setMsg({ ok: true, text: `Imported ${Object.values(counts).reduce((a, b) => a + b, 0)} records (${mode}).` }); }}>Import</Button>
        </>}>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 font-medium">Import mode</legend>
          <label className="flex gap-2"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span><strong>Replace</strong> — restore exactly; current progress on this device is overwritten.</span></label>
          <label className="flex gap-2"><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /><span><strong>Merge</strong> — keep current progress and add the backup's records.</span></label>
        </fieldset>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset} title="Reset all progress?" description="This permanently deletes every answer, flashcard schedule, lesson progress, exam and setting on this device. Export a backup first if you might want it back."
        footer={<><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" onClick={async () => { await resetAllData(); resetOnboardingCompleted(); setConfirmReset(false); nav('/onboarding'); }}>Delete everything</Button></>} />
    </div>
  );
}
