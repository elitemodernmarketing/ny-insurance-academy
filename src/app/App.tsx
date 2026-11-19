import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './Shell';
import { ThemeSync } from './ThemeSync';
import { ErrorBoundary } from './ErrorBoundary';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { Spinner } from '@/components/ui/misc';
import { useSettingsLoaded } from '@/db/hooks';
import { onboardingCompletedThisSession } from '@/features/onboarding/onboardingState';

const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Onboarding = lazy(() => import('@/features/onboarding/OnboardingPage'));
const Curriculum = lazy(() => import('@/features/curriculum/CurriculumPage'));
const SectionPage = lazy(() => import('@/features/curriculum/SectionPage'));
const LessonPage = lazy(() => import('@/features/curriculum/LessonPage'));
const Dictionary = lazy(() => import('@/features/dictionary/DictionaryPage'));
const TermPage = lazy(() => import('@/features/dictionary/TermPage'));
const ComparePage = lazy(() => import('@/features/dictionary/ComparePage'));
const Flashcards = lazy(() => import('@/features/flashcards/FlashcardsPage'));
const PracticeHome = lazy(() => import('@/features/practice/PracticeHome'));
const PracticeSession = lazy(() => import('@/features/practice/PracticeSession'));
const ExamHome = lazy(() => import('@/features/exam/ExamHome'));
const ExamSession = lazy(() => import('@/features/exam/ExamSession'));
const ExamResults = lazy(() => import('@/features/exam/ExamResults'));
const Review = lazy(() => import('@/features/review/ReviewPage'));
const ScenariosHome = lazy(() => import('@/features/scenarios/ScenariosHome'));
const ScenarioPage = lazy(() => import('@/features/scenarios/ScenarioPage'));
const Analytics = lazy(() => import('@/features/analytics/AnalyticsPage'));
const Planner = lazy(() => import('@/features/planner/PlannerPage'));
const Tutor = lazy(() => import('@/features/tutor/TutorPage'));
const ContentPage = lazy(() => import('@/features/content/ContentPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const NotFound = lazy(() => import('@/features/dashboard/NotFound'));

/** First launch goes to onboarding; once completed it is never forced again. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const s = useSettingsLoaded();
  const loc = useLocation();
  if (s === undefined) return <Spinner label="Loading your progress" />;
  if (!s.onboardingDone && !onboardingCompletedThisSession() && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <TooltipProvider>
        <ThemeSync />
        <Shell>
          <ErrorBoundary>
            <Suspense fallback={<Spinner />}>
              <OnboardingGate>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/learn" element={<Curriculum />} />
                  <Route path="/learn/:sectionId" element={<SectionPage />} />
                  <Route path="/lesson/:lessonId" element={<LessonPage />} />
                  <Route path="/dictionary" element={<Dictionary />} />
                  <Route path="/dictionary/compare" element={<ComparePage />} />
                  <Route path="/dictionary/:termId" element={<TermPage />} />
                  <Route path="/flashcards" element={<Flashcards />} />
                  <Route path="/practice" element={<PracticeHome />} />
                  <Route path="/practice/session/:sessionId" element={<PracticeSession />} />
                  <Route path="/exam" element={<ExamHome />} />
                  <Route path="/exam/:sessionId" element={<ExamSession />} />
                  <Route path="/exam/:sessionId/results" element={<ExamResults />} />
                  <Route path="/review" element={<Review />} />
                  <Route path="/scenarios" element={<ScenariosHome />} />
                  <Route path="/scenarios/:scenarioId" element={<ScenarioPage />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/planner" element={<Planner />} />
                  <Route path="/tutor" element={<Tutor />} />
                  <Route path="/content" element={<ContentPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </OnboardingGate>
            </Suspense>
          </ErrorBoundary>
        </Shell>
      </TooltipProvider>
    </BrowserRouter>
  );
}
