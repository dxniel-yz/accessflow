// @ts-check
/** Demo suggestion only: names can collide, so callers may edit the reference.
 * @param {string} firstName @param {string} lastName */
export function demoPersonReference(firstName, lastName) {
  const name = `${firstName.trim()} ${lastName.trim()}`.normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `demo-person-${name || "unnamed"}`;
}

/** Display only, using browser locale/timezone. Never changes source timestamps.
 * @param {unknown} value */
export function formatDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)
  } · ${
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
      .format(date)
  }`;
}

/** @param {import('../domain/index.ts').Verification} verification */
export function rejectionReason(verification) {
  return verification.status === "rejected"
    ? verification.notes?.trim() || undefined
    : undefined;
}

/** Presentation decision only; does not modify access selections.
 * @param {import('../domain/index.ts').AccessPackage | undefined} accessPackage */
export function showRemovalSummary(accessPackage) {
  return Boolean(accessPackage?.defaultApplicationIds.length);
}

/** Friendly labels are presentation only; unknown values retain their spelling. @param {string} value */
export function displayLabel(value) {
  /** @type {Record<string, string>} */
  const labels = {
    account: "Accounts",
    onsite: "Onsite",
    hybrid: "Hybrid",
    remote: "Remote",
    google_workspace: "Google Workspace",
    slack: "Slack",
    "demo-workspace": "Workspace A",
    "demo-workspace-b": "Workspace B",
    standard: "Standard",
    "custom/high-performance": "Higher Performance / Custom",
    salary: "Salary",
    hourly: "Hourly",
    contractor: "Contractor",
  };
  return labels[value] ??
    value.replaceAll("_", " ").replace(
      /^[a-z]/,
      (letter) => letter.toUpperCase(),
    );
}

/** Replace known workspace IDs embedded in backend-generated task titles. @param {string} text */
export function displayTaskTitle(text) {
  return text.replace(/\bdemo-workspace(?:-b)?\b/g, (id) => displayLabel(id));
}

/** Generated once per browser draft and reused through review/edit. @param {Date} [now] */
export function createRequestMetadata(now = new Date()) {
  return {
    id: `demo-onboarding-${now.getTime()}`,
    requestDate: now.toISOString(),
  };
}

/** @param {import('../domain/index.ts').OnboardingStatus | undefined} status */
export function workflowStep(status) {
  if (!status || status === "draft") return 0;
  if (status === "submitted" || status === "provisioning") return 1;
  if (status === "ready_for_verification") return 2;
  return 3;
}

/** @param {readonly import('../domain/index.ts').ChecklistItem[]} checklist */
export function checklistProgress(checklist) {
  const required = checklist.filter((item) => item.required);
  const completed =
    required.filter((item) => item.status === "completed").length;
  return {
    completed,
    total: required.length,
    percent: required.length
      ? Math.round(completed / required.length * 100)
      : 100,
  };
}

/** Transform presentation fields only; never calculate final application access.
 * @param {FormData} data
 * @param {{id: string, requestDate: string}} [metadata]
 * @returns {import('../application/index.ts').CreateOnboardingInput} */
export function intakeInput(data, metadata = createRequestMetadata()) {
  /** @param {string} name */
  const value = (name) => String(data.get(name) ?? "").trim();
  /** @param {string} name */
  const optional = (name) => value(name) || undefined;
  /** @param {string} name */
  const many = (name) => data.getAll(name).map(String);
  return {
    id: metadata.id,
    employee: {
      firstName: value("firstName"),
      lastName: value("lastName"),
      preferredName: optional("preferredName"),
      personalEmail: optional("personalEmail"),
      jobTitle: value("jobTitle"),
      department: value("department"),
      manager: value("manager"),
      employmentType:
        /** @type {import('../domain/index.ts').EmploymentType} */ (value(
          "employmentType",
        )),
      startDate: value("startDate"),
      workLocation:
        /** @type {import('../domain/index.ts').WorkLocation} */ (value(
          "workLocation",
        )),
    },
    coreAccountRequests: [{
      service: "google_workspace",
      workspaceIds: many("google_workspace"),
    }, { service: "slack", workspaceIds: many("slack") }],
    accessPackageId: optional("accessPackageId"),
    addedApplicationIds: many("addedApplicationIds"),
    removedApplicationIds: many("removedApplicationIds"),
    equipmentRequest: {
      platform:
        /** @type {import('../domain/index.ts').LaptopPlatform} */ (value(
          "platform",
        )),
      deviceRequirements:
        /** @type {import('../domain/index.ts').DeviceRequirements} */ (value(
          "deviceRequirements",
        )),
      ...(value("deviceRequirements") === "custom/high-performance" &&
          value("workloadRequirements")
        ? { workloadRequirements: value("workloadRequirements") }
        : {}),
    },
    requestedBy: value("requestedBy"),
    requestDate: metadata.requestDate,
    additionalNotes: optional("additionalNotes"),
  };
}

/** Presentation of the backend's access snapshot, not an access resolver. @param {import('../application/index.ts').OnboardingSession} session */
export function syncPreview(session) {
  const onboarding = session.onboarding;
  return {
    employee:
      `${onboarding.employee.firstName} ${onboarding.employee.lastName}`,
    department: onboarding.employee.department,
    manager: onboarding.employee.manager,
    startDate: onboarding.employee.startDate,
    verification: onboarding.verification.status,
    applications: [...onboarding.accessRequest.finalApplicationIds],
    coreAccounts: onboarding.coreAccountRequests.map((account) => ({
      service: account.service,
      workspaceIds: [...account.workspaceIds],
    })),
    progress: checklistProgress(session.checklist),
  };
}
