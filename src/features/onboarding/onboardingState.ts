/**
 * Bridges the gap between writing settings.onboardingDone and the live query delivering it, so the onboarding gate
 * does not bounce the learner back to /onboarding right after they finish.
 */
let completed = false;
export function markOnboardingCompleted(): void { completed = true; }
export function resetOnboardingCompleted(): void { completed = false; }
export function onboardingCompletedThisSession(): boolean { return completed; }
