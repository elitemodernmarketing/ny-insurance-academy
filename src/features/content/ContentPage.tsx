import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle, CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import { content } from '@/content';
import { computeCoverage, type CoverageStatus } from '@/content/coverage';
import { isEligible } from '@/content/schema';
import { localDate } from '@/lib/dates';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { PageHeader, Select, Stat } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';

const STATUS_ICON: Record<CoverageStatus, JSX.Element> = {
  complete: <CheckCircle2 className="h-4 w-4 text-success" aria-label="complete" />,
  partial: <CircleDot className="h-4 w-4 text-warning" aria-label="partial" />,
  gap: <CircleDashed className="h-4 w-4 text-danger" aria-label="gap" />,
};

/** Content transparency: official-outline coverage, source registry, drafts excluded from learners, overdue reviews. */
export default function ContentPage() {
  const cov = useMemo(() => computeCoverage({
    sections: content.manifest.sections,
    lessons: content.lessons, questions: content.questions, terms: content.terms,
    draftQuestions: content.drafts.questions,
  }, content.manifest.exam.questionCount), []);
  const [sec, setSec] = useState<string>('all');
  const [onlyGaps, setOnlyGaps] = useState(true);
  const today = localDate();
  const overdue = [...content.all.terms, ...content.all.questions, ...content.all.lessons].filter((r) => r.timeSensitive && r.reviewDue && r.reviewDue < today);
  const totals = { complete: cov.nodes.filter((n) => n.status === 'complete').length, partial: cov.nodes.filter((n) => n.status === 'partial').length, gap: cov.nodes.filter((n) => n.status === 'gap').length };
  const shortfall = cov.sections.filter((s) => !s.meetsFullExam);
  const nodes = cov.nodes.filter((n) => (sec === 'all' || n.sectionId === sec) && (!onlyGaps || n.status !== 'complete'));
  const verifiedQ = content.questions.filter((q) => q.verification.status === 'verified').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Content & coverage" description={`Course content mapped to the official PSI Series ${content.manifest.series} outline (bulletin updated 4/28/2023, checked ${content.manifest.source.checkedOn}). Only verified or reviewed content is shown to you in lessons, practice and exams.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outline topics complete" value={`${totals.complete}/${cov.nodes.length}`} hint={`${totals.partial} partial · ${totals.gap} gaps`} tone={totals.gap ? 'warning' : 'success'} />
        <Stat label="Eligible questions" value={content.questions.length} hint={`${verifiedQ} verified vs. primary sources · ${content.questions.length - verifiedQ} reviewed principles`} />
        <Stat label="Glossary terms" value={content.terms.length} hint={`${content.comparisons.length} curated comparisons`} />
        <Stat label="Full exam possible" value={shortfall.length ? 'Shortfall' : 'Yes'} tone={shortfall.length ? 'danger' : 'success'} hint={shortfall.length ? `${shortfall.length} section(s) below blueprint` : '150 unique questions by weight'} />
      </div>

      {content.loadErrors.length > 0 && (
        <Card className="border-danger/40"><CardBody className="pt-4">
          <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4" aria-hidden />{content.loadErrors.length} content file(s) failed validation and were skipped</div>
          <ul className="mt-2 space-y-1 text-sm">{content.loadErrors.map((e) => <li key={e.file}><code>{e.file}</code>: {e.message}</li>)}</ul>
        </CardBody></Card>
      )}

      <Tabs defaultValue="coverage">
        <TabsList>
          <TabsTrigger value="coverage">Outline coverage</TabsTrigger>
          <TabsTrigger value="bank">Question bank</TabsTrigger>
          <TabsTrigger value="sources">Sources ({content.sources.length})</TabsTrigger>
          <TabsTrigger value="drafts">Drafts & reviews ({content.drafts.terms.length + content.drafts.questions.length + content.drafts.lessons.length + overdue.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="coverage">
          <Card>
            <CardHeader title="Official outline topics" description="Complete = taught in a lesson and tested by at least one question. Partial = only one of the two. Gap = neither yet." />
            <CardBody>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div className="w-64"><Select label="Section" value={sec} onChange={(e) => setSec(e.target.value)}>
                  <option value="all">All sections</option>
                  {content.sections.map((s) => <option key={s.id} value={s.id}>{s.shortName} ({s.weightPct}%)</option>)}
                </Select></div>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />Show only gaps and partial topics</label>
                <span className="pb-2 text-sm text-muted">{nodes.length} topics</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-2">Topic</th><th className="px-2 text-right">Lessons</th><th className="px-2 text-right">Questions</th><th className="px-2 text-right">Terms</th><th className="pl-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {nodes.slice(0, 400).map((n) => (
                      <tr key={n.id} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2" style={{ paddingLeft: `${n.depth * 14}px` }}>
                          <span className="mr-1 font-mono text-xs text-muted">{n.id}</span>{n.title}{n.refs && <span className="ml-1 text-xs text-muted">({n.refs})</span>}
                        </td>
                        <td className="px-2 text-right tabular-nums">{n.lessons.length ? <Link className="text-primary hover:underline" to={`/lesson/${n.lessons[0]}`}>{n.lessons.length}</Link> : n.lessonViaAncestor ? <span className="text-muted">parent</span> : 0}</td>
                        <td className="px-2 text-right tabular-nums">{n.questions}{n.draftQuestions ? <span className="text-xs text-muted"> (+{n.draftQuestions} draft)</span> : null}</td>
                        <td className="px-2 text-right tabular-nums">{n.terms}</td>
                        <td className="pl-2"><span className="inline-flex items-center gap-1">{STATUS_ICON[n.status]}{n.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {nodes.length === 0 && <p className="py-6 text-center text-sm text-muted">Every topic in this view is fully covered.</p>}
              </div>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader title={`Bank sufficiency for a ${content.manifest.exam.questionCount}-question exam`} description={`Each section needs at least ceil(${content.manifest.exam.questionCount} × weight) unique eligible questions. Questions are never duplicated to fill a gap.`} />
            <CardBody className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="py-2">Section</th><th className="text-right">Weight</th><th className="text-right">Eligible</th><th className="text-right">Needed per exam</th><th className="text-right">Target bank</th><th className="pl-3">Topics complete</th></tr></thead>
                <tbody>
                  {cov.sections.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="py-1.5"><Link to={`/learn/${s.id}`} className="hover:underline">{content.sectionById.get(s.id as never)?.shortName ?? s.name}</Link></td>
                      <td className="text-right tabular-nums">{s.weightPct}%</td>
                      <td className={cn('text-right font-medium tabular-nums', !s.meetsFullExam && 'text-danger')}>{s.eligibleQuestions}</td>
                      <td className="text-right tabular-nums">{s.minForOneExam}</td>
                      <td className="text-right tabular-nums">{s.targetQuestions}</td>
                      <td className="pl-3 tabular-nums">{s.complete}/{s.nodes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader title="Source registry" description="Primary sources behind verified content. Excerpts are saved in the project's research/ folder." />
            <CardBody>
              <ul className="divide-y divide-border">
                {content.sources.map((s) => (
                  <li key={s.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{s.kind}</Badge>
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{s.title}<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only">(opens in new tab)</span></a> : <span className="font-medium">{s.title}</span>}
                    </div>
                    <div className="text-xs text-muted">{s.publisher}{s.citation ? ` · ${s.citation}` : ''}{s.retrievedOn ? ` · retrieved ${s.retrievedOn}` : ''}{s.localCopy ? ` · excerpt: ${s.localCopy}` : ''}</div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="drafts">
          <Card>
            <CardHeader title="Excluded from learners" description="Draft content, or New York / time-sensitive content without a verified primary source. Shown here only for transparency." />
            <CardBody className="space-y-4 text-sm">
              {overdue.length > 0 && (
                <div>
                  <h3 className="font-semibold text-warning">Time-sensitive content past its review date</h3>
                  <ul className="mt-1 list-disc pl-5">{overdue.map((r) => <li key={r.id}><code>{r.id}</code> — review was due {r.reviewDue}</li>)}</ul>
                </div>
              )}
              {[['Terms', content.drafts.terms], ['Questions', content.drafts.questions], ['Lessons', content.drafts.lessons]].map(([label, list]) => (
                <div key={label as string}>
                  <h3 className="font-semibold">{label as string} ({(list as { id: string }[]).length})</h3>
                  {(list as { id: string; verification: { status: string; notes?: string }; nySpecific: boolean }[]).length === 0 ? <p className="text-muted">None.</p> : (
                    <ul className="mt-1 space-y-1">
                      {(list as { id: string; verification: { status: string; notes?: string }; nySpecific: boolean; sources: string[]; timeSensitive: boolean }[]).map((r) => (
                        <li key={r.id}><code>{r.id}</code> <Badge tone="warning">{r.verification.status}</Badge>{r.nySpecific && <Badge tone="primary" className="ml-1">NY</Badge>} <span className="text-muted">{r.verification.notes ?? (!isEligible(r as never) && r.verification.status !== 'draft' ? 'needs a verified primary source' : '')}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
