import type { OnboardingSession } from "./onboarding-session.ts";

export interface OnboardingSessionRepository {
  save(session: OnboardingSession): void;
  getById(id: string): OnboardingSession | undefined;
}
