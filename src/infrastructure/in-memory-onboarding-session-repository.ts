import type { OnboardingSessionRepository } from "../application/onboarding-session-repository.ts";
import type { OnboardingSession } from "../application/onboarding-session.ts";

export class InMemoryOnboardingSessionRepository
  implements OnboardingSessionRepository {
  private readonly sessions = new Map<string, OnboardingSession>();

  save(session: OnboardingSession): void {
    this.sessions.set(session.onboarding.id, structuredClone(session));
  }

  getById(id: string): OnboardingSession | undefined {
    const session = this.sessions.get(id);
    return session === undefined ? undefined : structuredClone(session);
  }
}
