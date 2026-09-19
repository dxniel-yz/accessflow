import {
  createOnboarding,
  type OnboardingConfiguration,
  prepareForVerification,
  startProvisioning,
  submitOnboarding,
  synchronizeInventory,
  updateChecklistItem,
  verifyOnboarding,
} from "../application/index.ts";
import type { OnboardingSessionRepository } from "../application/onboarding-session-repository.ts";
import { DemoIdentityInventoryConnector } from "../connectors/demo-identity-inventory-connector.ts";
import { InMemoryOnboardingSessionRepository } from "../infrastructure/in-memory-onboarding-session-repository.ts";
import { demoConfiguration } from "../demo/configuration.ts";
import { handleRequest as healthHandler } from "../app.ts";
import { actionContext, createInput } from "./validation.ts";
import {
  badRequest,
  choice,
  errorResponse,
  HttpError,
  jsonBody,
  optionalString,
  string,
} from "./http.ts";

export interface ApiDependencies {
  repository: OnboardingSessionRepository;
  connector: DemoIdentityInventoryConnector;
  configuration: OnboardingConfiguration;
}

export function createApiHandler(dependencies: ApiDependencies = {
  repository: new InMemoryOnboardingSessionRepository(),
  connector: new DemoIdentityInventoryConnector(),
  configuration: demoConfiguration,
}): (request: Request) => Promise<Response> {
  const { repository, connector, configuration } = dependencies;
  async function route(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/health") {
      return healthHandler(request);
    }
    if (request.method === "GET" && pathname === "/api/demo/inventory") {
      return Response.json(connector.getRecords());
    }
    const notFound = () =>
      new HttpError(404, "NOT_FOUND", "Route or onboarding not found");
    if (request.method === "POST" && pathname === "/api/onboardings") {
      const input = createInput(await jsonBody(request));
      const context = actionContext(request);
      if (repository.getById(input.id)) {
        throw new HttpError(
          409,
          "WORKFLOW_CONFLICT",
          "Onboarding ID already exists",
        );
      }
      const session = createOnboarding(input, configuration, context);
      repository.save(session);
      return Response.json(session, { status: 201 });
    }
    let parts: string[];
    try {
      parts = pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      badRequest("Invalid path encoding");
    }
    if (parts[0] !== "api" || parts[1] !== "onboardings" || parts.length < 3) {
      throw notFound();
    }
    const id = string(parts[2], "onboarding ID");
    const suffix = parts.slice(3).join("/");
    const isChecklist = parts.length === 5 && parts[3] === "checklist";
    if (
      !(request.method === "GET" && parts.length === 3) &&
      !(request.method === "POST" &&
        (isChecklist ||
          [
            "submit",
            "provisioning/start",
            "verification/prepare",
            "verification",
            "sync",
          ].includes(suffix)))
    ) throw notFound();
    const session = repository.getById(id);
    if (!session) throw notFound();
    if (request.method === "GET") return Response.json(session);
    const body = await jsonBody(request);
    const context = actionContext(request);
    if (session.auditEvents.some((event) => event.id === context.eventId)) {
      throw new HttpError(409, "WORKFLOW_CONFLICT", "Event ID already used");
    }
    let updated;
    if (isChecklist) {
      updated = updateChecklistItem(
        session,
        string(parts[4], "item ID"),
        choice(
          body.status,
          ["in_progress", "completed", "skipped"],
          "checklist status",
        ),
        context,
      );
    } else {switch (suffix) {
        case "submit":
          updated = submitOnboarding(session, context);
          break;
        case "provisioning/start":
          updated = startProvisioning(session, context);
          break;
        case "verification/prepare":
          updated = prepareForVerification(session, context);
          break;
        case "verification":
          updated = verifyOnboarding(
            session,
            choice(body.decision, ["approved", "rejected"], "decision"),
            context,
            optionalString(body.notes, "notes"),
          );
          break;
        case "sync": {
          const result = await synchronizeInventory(
            session,
            string(body.personReference, "personReference"),
            connector,
            {
              started: { ...context, eventId: `${context.eventId}:started` },
              completed: {
                ...context,
                eventId: `${context.eventId}:completed`,
              },
              failed: { ...context, eventId: `${context.eventId}:failed` },
            },
          );
          repository.save(result.session);
          return result.ok ? Response.json(result) : Response.json({
            ok: false,
            session: result.session,
            error: {
              code: "SYNC_FAILED",
              message: "Demo inventory synchronization failed",
            },
          }, { status: 500 });
        }
        default:
          throw notFound();
      }}
    repository.save(updated);
    return Response.json(updated);
  }
  // Serialize requests within this local handler so async sync cannot overwrite a newer session.
  let queue: Promise<unknown> = Promise.resolve();
  return (request) => {
    const response = queue.then(() => route(request)).catch(errorResponse);
    queue = response;
    return response;
  };
}
