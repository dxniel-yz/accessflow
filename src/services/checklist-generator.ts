import type {
  Application,
  ChecklistItem,
  CoreAccountService,
  OnboardingRequest,
} from "../domain/index.ts";

const accountLabels: Record<CoreAccountService, string> = {
  google_workspace: "Google Workspace",
  slack: "Slack",
};

/** Generate fresh pending tasks, without resolving access or changing the request. */
export function generateChecklist(
  request: OnboardingRequest,
  applications: readonly Application[],
): ChecklistItem[] {
  const catalog = new Map<string, Application>();
  for (const application of applications) {
    if (catalog.has(application.id)) {
      throw new Error(`Duplicate application ID: ${application.id}`);
    }
    catalog.set(application.id, application);
  }

  const items: ChecklistItem[] = [];
  const seenIds = new Set<string>();
  function add(
    category: string,
    key: string[],
    title: string,
    description?: string,
  ): void {
    // Encode each component so delimiters inside caller IDs cannot collide.
    const id = [request.id, category, ...key].map(encodeURIComponent).join(":");
    if (seenIds.has(id)) return;
    seenIds.add(id);
    items.push({
      id,
      title,
      ...(description === undefined ? {} : { description }),
      category,
      required: true,
      status: "pending",
    });
  }

  for (const account of request.coreAccountRequests) {
    for (const workspaceId of account.workspaceIds) {
      add(
        "account",
        [account.service, workspaceId],
        `Create ${accountLabels[account.service]} account — ${workspaceId}`,
      );
    }
  }

  for (
    const applicationId of new Set(request.accessRequest.finalApplicationIds)
  ) {
    const application = catalog.get(applicationId);
    if (!application) {
      throw new Error(`Unknown application ID: ${applicationId}`);
    }
    if (!application.active) {
      throw new Error(`Inactive application ID: ${applicationId}`);
    }
    if (!application.provisioningTasks?.length) {
      add(
        "application_access",
        [application.id, "fallback"],
        `Provision access to ${application.displayName}`,
      );
      continue;
    }
    const templateIds = new Set<string>();
    for (const task of application.provisioningTasks) {
      if (templateIds.has(task.id)) {
        throw new Error(
          `Duplicate provisioning task ID: ${application.id}/${task.id}`,
        );
      }
      templateIds.add(task.id);
      add(
        "application_access",
        [application.id, "template", task.id],
        `${task.title} — ${application.displayName}`,
        task.description,
      );
    }
  }

  const equipment = request.equipmentRequest;
  if (equipment.deviceRequirements === "custom/high-performance") {
    add(
      "equipment",
      ["workload-review"],
      "Review workload/hardware requirements",
      equipment.workloadRequirements,
    );
  }
  add("equipment", ["laptop"], `Prepare company ${equipment.platform} laptop`);
  return items;
}
