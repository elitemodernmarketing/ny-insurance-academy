import { Link, useParams } from 'react-router-dom';
import { useStudyTimer } from '@/db/hooks';
import { EmptyState } from '@/components/ui/misc';
import { ButtonLink } from '@/components/ui/Button';
import { ScenarioFrame } from './ScenarioFrame';
import { scenarioById } from './scenarioMeta';
import LifeSelection from './LifeSelection';
import DeductibleScenario from './DeductibleScenario';
import BeneficiaryScenario from './BeneficiaryScenario';
import PolicyTimelineScenario from './PolicyTimelineScenario';
import ComplianceScenario from './ComplianceScenario';
import TerminologyChallenge from './TerminologyChallenge';

export default function ScenarioPage() {
  const { scenarioId } = useParams();
  const meta = scenarioById(scenarioId);
  useStudyTimer('scenario');
  if (!meta) {
    return (
      <EmptyState title="Scenario not found" action={<ButtonLink to="/scenarios">Back to scenarios</ButtonLink>}>
        There is no scenario called <code>{scenarioId}</code>. <Link className="text-primary underline" to="/scenarios">See all scenarios</Link>.
      </EmptyState>
    );
  }
  return (
    <ScenarioFrame title={meta.title} description={meta.blurb}>
      {meta.id === 'life-selection' && <LifeSelection />}
      {meta.id === 'deductible' && <DeductibleScenario />}
      {meta.id === 'beneficiary' && <BeneficiaryScenario />}
      {meta.id === 'policy-timeline' && <PolicyTimelineScenario />}
      {meta.id === 'compliance' && <ComplianceScenario />}
      {meta.id === 'terminology' && <TerminologyChallenge />}
    </ScenarioFrame>
  );
}
