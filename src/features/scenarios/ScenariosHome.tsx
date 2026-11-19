import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight, Hourglass, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/ui/misc';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { content } from '@/content';
import { PENDING_NOTE, SCENARIOS } from './scenarioMeta';

/** Scenarios shown for the active track: the default track shows all; other tracks only those with content (and no health-only calculators). */
function visibleScenarios() {
  if (content.manifest.id === 'ny-17-55') return SCENARIOS;
  return SCENARIOS.filter((s) => s.id !== 'deductible' && (s.available() ?? 1) > 0);
}
import { useScenarioProgress } from './progress';

export default function ScenariosHome() {
  const progress = useScenarioProgress();
  const list = visibleScenarios();
  return (
    <div>
      <PageHeader eyebrow="Practice by doing" title="Scenario Simulator"
        description={`${list.length} short, hands-on simulation${list.length === 1 ? '' : 's'}. Each one builds the judgment the exam tests, not just recall.`} />
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const ids = s.progressIds();
          const done = ids.filter((id) => progress.has(id)).length;
          const avail = s.available();
          const pending = avail === 0;
          const complete = ids.length > 0 && done === ids.length;
          const status = pending ? 'pending' : complete ? 'complete' : done > 0 ? 'started' : 'new';
          return (
            <li key={s.id}>
              <Card className="flex h-full flex-col">
                <CardBody className="flex flex-1 flex-col gap-3 pt-4 sm:pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><Workflow className="h-5 w-5" aria-hidden /></span>
                    {status === 'complete' && <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Completed</Badge>}
                    {status === 'started' && <Badge tone="info"><Circle className="h-3 w-3" aria-hidden />{done} of {ids.length} done</Badge>}
                    {status === 'new' && <Badge>Not started</Badge>}
                    {status === 'pending' && <Badge tone="warning"><Hourglass className="h-3 w-3" aria-hidden />Content pending</Badge>}
                  </div>
                  <h2 className="text-base font-semibold leading-snug">{s.title}</h2>
                  <p className="text-sm text-muted">{s.blurb}</p>
                  <p className="text-xs text-muted"><span className="font-medium text-fg">Skills:</span> {s.skills}</p>
                  {pending && <p className="text-xs text-warning">{PENDING_NOTE}</p>}
                  <div className="mt-auto pt-2">
                    <Link to={`/scenarios/${s.id}`} data-testid={`scenario-${s.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      {pending ? 'Open' : status === 'complete' ? 'Play again' : done > 0 ? 'Continue' : 'Start'}
                      <ArrowRight className="h-4 w-4" aria-hidden /><span className="sr-only"> {s.title}</span>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
