import { ApiClient, ApiError } from "./api-client.js";
import {
  checklistProgress,
  createRequestMetadata,
  demoPersonReference,
  displayLabel,
  displayTaskTitle,
  formatDateTime,
  intakeInput,
  rejectionReason,
  showRemovalSummary,
  syncPreview,
  workflowStep,
} from "./state.js";

const api = new ApiClient();
const main = document.querySelector("#main");
const notice = document.querySelector("#notice");
let config;
let session;
let draft;
let requestMetadata = createRequestMetadata();
let reviewing = false;
let busy = false;
let filter = "all";
let message = "";
let messageKind = "info";
const storageKey = "accessflow-current-onboarding";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const label = displayLabel;
const chip = (value, kind = "") =>
  `<span class="chip ${kind}">${escape(label(value))}</span>`;
const chips = (values) =>
  values.length
    ? values.map((value) => chip(value)).join("")
    : '<span class="muted">None requested</span>';
const appName = (id) =>
  config.applications.find((app) => app.id === id)?.displayName ?? id;
const button = (text, action, style = "primary") =>
  `<button class="${style}" type="button" data-action="${action}">${text}</button>`;
const pair = (name, value) =>
  `<div><dt>${escape(name)}</dt><dd>${escape(value || "—")}</dd></div>`;
const title = (eyebrow, heading, description) =>
  `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${
    escape(heading)
  }</h1><p class="subtitle">${escape(description)}</p></div>${
    session ? chip(session.onboarding.status, "status") : ""
  }</div>`;
const section = (number, heading, content) =>
  `<section class="panel"><div class="section-heading"><span class="section-number">${number}</span><h2>${heading}</h2></div>${content}</section>`;

function remember(id) {
  try {
    if (id) localStorage.setItem(storageKey, id);
    else localStorage.removeItem(storageKey);
  } catch { /* Storage is optional; the server remains authoritative. */ }
}

function accept(value) {
  session = value;
  remember(session.onboarding.id);
}

function field(name, text, options = {}) {
  const type = options.type ?? "text";
  const required = options.optional ? "" : "required";
  return `<label class="field">${text}${
    options.optional ? ' <span class="optional">OPTIONAL</span>' : ""
  }<input name="${name}" type="${type}" ${required} value="${
    escape(options.value ?? "")
  }" ${
    options.placeholder ? `placeholder="${escape(options.placeholder)}"` : ""
  }></label>`;
}

function select(name, text, values) {
  return `<label class="field">${text}<select name="${name}">${
    values.map(([value, text]) =>
      `<option value="${escape(value)}">${escape(text)}</option>`
    ).join("")
  }</select></label>`;
}

function checks(name, values) {
  return `<div class="check-options">${
    values.map(([value, text]) =>
      `<label class="check-option"><input type="checkbox" name="${name}" value="${
        escape(value)
      }"><span>${escape(text)}</span></label>`
    ).join("")
  }</div>`;
}

function summary(input, finalIds) {
  const employee = input.employee;
  const equipment = input.equipmentRequest;
  const pkg = config.accessPackages.find((entry) =>
    entry.id === (input.accessPackageId ?? input.accessRequest?.accessPackageId)
  );
  return `<div class="summary-block"><p class="eyebrow">REQUEST PROFILE</p><h3>${
    escape(
      [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
        "New employee",
    )
  }</h3><p class="muted">${
    escape(employee.jobTitle || "Role not entered")
  }</p><dl class="details">
    ${pair("Department", employee.department)}${
    pair("Start date", employee.startDate)
  }${pair("Work location", label(employee.workLocation))}${
    pair("Manager", employee.manager)
  }${
    pair(
      "Laptop",
      `${label(equipment.platform)} / ${label(equipment.deviceRequirements)}`,
    )
  }</dl></div>
    <div class="summary-block"><p class="eyebrow">CORE ACCOUNTS</p>${
    input.coreAccountRequests.map((account) =>
      `<p class="small-title">${label(account.service)}</p><div class="chips">${
        chips(account.workspaceIds)
      }</div>`
    ).join("")
  }</div>
    <div class="summary-block"><p class="eyebrow">${
    finalIds ? "FINAL APPLICATION ACCESS" : "PACKAGE & EXCEPTIONS"
  }</p>${
    finalIds
      ? `<div class="chips">${chips(finalIds.map(appName))}</div>`
      : `<p>${
        escape(pkg?.displayName ?? "No access package")
      }</p><p class="small-title">Package defaults</p><div class="chips">${
        chips((pkg?.defaultApplicationIds ?? []).map(appName))
      }</div><p class="small-title">Additions</p><div class="chips">${
        chips((input.addedApplicationIds ?? []).map(appName))
      }</div>${
        showRemovalSummary(pkg)
          ? `<p class="small-title">Removals</p><div class="chips">${
            chips((input.removedApplicationIds ?? []).map(appName))
          }</div>`
          : ""
      }<p class="hint">Final access is resolved by AccessFlow when you create the request.</p>`
  }</div>`;
}

function intake() {
  main.innerHTML = title(
    "01 / REQUEST INTAKE",
    "New employee onboarding",
    "Define the request. AccessFlow turns it into an actionable IT checklist.",
  ) +
    `<form id="intake"><div class="intake-layout"><div class="form-sections">
    ${
      section(
        "01",
        "Employee information",
        `<div class="form-grid">${field("firstName", "First name")}${
          field("lastName", "Last name")
        }${field("preferredName", "Preferred name", { optional: true })}${
          field("personalEmail", "Personal email", {
            optional: true,
            type: "email",
          })
        }${field("jobTitle", "Job title")}${field("department", "Department")}${
          field("manager", "Manager", { placeholder: "demo-manager" })
        }${
          select("employmentType", "Employment type", [["salary", "Salary"], [
            "hourly",
            "Hourly",
          ], ["contractor", "Contractor"]])
        }${field("startDate", "Start date", { type: "date" })}${
          select("workLocation", "Work location", [["onsite", "Onsite"], [
            "hybrid",
            "Hybrid",
          ], ["remote", "Remote"]])
        }</div>`,
      )
    }
    ${
      section(
        "02",
        "Core accounts",
        `<p class="hint">Choose zero or more demo environments for each account service.</p><div class="form-grid">${
          ["google_workspace", "slack"].map((service) =>
            `<fieldset><legend>${label(service)}</legend>${
              checks(service, config.workspaceIds.map((id) => [id, label(id)]))
            }</fieldset>`
          ).join("")
        }</div>`,
      )
    }
    ${
      section(
        "03",
        "Application access",
        `${
          select("accessPackageId", "Access package", [[
            "",
            "No package — manual access only",
          ], ...config.accessPackages.map((pkg) => [pkg.id, pkg.displayName])])
        }<div id="package-defaults" class="package-defaults"></div><p class="hint">Packages provide defaults. Add or remove individual applications as exceptions; the backend resolves final access.</p><div class="form-grid" id="access-exceptions"><fieldset><legend>Add applications</legend>${
          checks(
            "addedApplicationIds",
            config.applications.filter((app) => app.active).map((
              app,
            ) => [app.id, app.displayName]),
          )
        }</fieldset><fieldset id="remove-applications"><legend>Remove applications</legend>${
          checks(
            "removedApplicationIds",
            config.applications.filter((app) => app.active).map((
              app,
            ) => [app.id, app.displayName]),
          )
        }</fieldset></div>`,
      )
    }
    ${
      section(
        "04",
        "Company laptop",
        `<div class="form-grid">${
          select("platform", "Platform", [["macOS", "macOS"], [
            "Windows",
            "Windows",
          ]])
        }${
          select("deviceRequirements", "Device requirements", [[
            "standard",
            "Standard",
          ], ["custom/high-performance", label("custom/high-performance")]])
        }</div><label class="field" id="workload-field" hidden>Workload requirements <span class="optional">OPTIONAL</span><textarea name="workloadRequirements" rows="3" placeholder="Describe the workload or hardware needs"></textarea></label>`,
      )
    }
    ${
      section(
        "05",
        "Request details",
        `<div class="form-grid">${
          field("requestedBy", "Requested by", { value: "demo-user" })
        }</div><label class="field">Additional notes <span class="optional">OPTIONAL</span><textarea name="additionalNotes" rows="3"></textarea></label>`,
      )
    }
    <div class="action-bar"><p>Nothing is created until you confirm the review.</p><button class="primary" type="submit">Review request <span aria-hidden="true">→</span></button></div></div>
    <aside class="summary panel"><div class="section-heading"><span class="live-dot"></span><h2>Intake summary</h2></div><div id="live-summary"></div><div class="summary-foot">LOCAL DEMO / FICTIONAL DATA ONLY</div></aside></div></form>`;
  const form = document.querySelector("#intake");
  if (draft) {
    for (const control of form.elements) {
      if (!control.name) continue;
      if (control.type === "checkbox") {
        control.checked = draft.getAll(control.name).includes(control.value);
      } else if (draft.has(control.name)) {
        control.value = draft.get(control.name);
      }
    }
  }
  function update() {
    const selectedPackage = config.accessPackages.find((entry) =>
      entry.id === form.elements.namedItem("accessPackageId").value
    );
    const hasDefaults = Boolean(selectedPackage?.defaultApplicationIds.length);
    const removals = document.querySelector("#remove-applications");
    removals.hidden = !hasDefaults;
    removals.disabled = !hasDefaults;
    if (!hasDefaults) {
      for (const control of removals.querySelectorAll("input")) {
        control.checked = false;
      }
    }
    document.querySelector("#access-exceptions").classList.toggle(
      "manual-access",
      !hasDefaults,
    );
    document.querySelector("#package-defaults").hidden = !hasDefaults;
    const input = intakeInput(new FormData(form), requestMetadata);
    document.querySelector("#live-summary").innerHTML = summary(input);
    document.querySelector("#workload-field").hidden =
      input.equipmentRequest.deviceRequirements !== "custom/high-performance";
    const pkg = config.accessPackages.find((entry) =>
      entry.id === input.accessPackageId
    );
    document.querySelector("#package-defaults").innerHTML =
      `<span class="eyebrow">DEFAULT ACCESS</span><div class="chips">${
        chips((pkg?.defaultApplicationIds ?? []).map(appName))
      }</div>`;
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    draft = new FormData(form);
    reviewing = true;
    render(true);
  });
  update();
}

function review() {
  const input = intakeInput(draft, requestMetadata);
  main.innerHTML = title(
    "01 / CONFIRM REQUEST",
    "Review before creating",
    "Check the details. No onboarding has been created yet.",
  ) +
    `<div class="review-layout"><section class="panel">${
      summary(input)
    }<div class="summary-block"><p class="eyebrow">EMPLOYEE DETAILS</p><dl class="details">${
      pair("Preferred name", input.employee.preferredName)
    }${pair("Personal email", input.employee.personalEmail)}${
      pair("Employment", label(input.employee.employmentType))
    }${
      pair("Workload requirements", input.equipmentRequest.workloadRequirements)
    }</dl></div></section>${
      section(
        "05",
        "Request metadata",
        `<dl class="details">${pair("Onboarding reference", input.id)}${
          pair("Requested by", input.requestedBy)
        }${pair("Request date", formatDateTime(input.requestDate))}${
          pair("Notes", input.additionalNotes)
        }</dl><p class="hint">Confirming creates, submits, and starts provisioning through the local API. No real accounts are provisioned.</p>`,
      )
    }</div><div class="action-bar">${
      button("← Back / edit", "edit", "secondary")
    }${button("Create onboarding →", "create")}</div>`;
}

function progressPanel() {
  const progress = checklistProgress(session.checklist);
  return `<div class="progress-panel"><div><p class="eyebrow">REQUIRED TASKS</p><strong>${progress.completed}<span> / ${progress.total}</span></strong></div><div class="progress-track"><div class="progress-meta"><span>Provisioning progress</span><span>${progress.percent}%</span></div><progress max="100" value="${progress.percent}" aria-label="Required checklist completion">${progress.percent}%</progress></div></div>`;
}

function checklist() {
  const onboarding = session.onboarding;
  const employee = onboarding.employee;
  const rejected = onboarding.verification.status === "rejected";
  const categories = [
    ...new Set(session.checklist.map((item) => item.category)),
  ];
  if (!categories.includes(filter)) filter = "all";
  main.innerHTML = title(
    "02 / IT PROVISIONING",
    `${employee.firstName} ${employee.lastName} — ${employee.jobTitle}`,
    `${employee.department} · ${
      label(employee.workLocation)
    } · Starts ${employee.startDate}`,
  ) +
    (rejected
      ? `<div class="banner warning"><strong>Verification rejected — review required.</strong>${
        rejectionReason(onboarding.verification)
          ? `<p><strong>Reason:</strong><br>${
            escape(rejectionReason(onboarding.verification))
          }</p>`
          : ""
      }<p>Review the request before preparing verification again.</p><p>Completed tasks remain recorded. This demo does not support reopening completed tasks.</p></div>`
      : "") +
    (onboarding.status === "submitted"
      ? `<div class="banner">The request is submitted. Start provisioning to continue. ${
        button("Start provisioning →", "advance")
      }</div>`
      : "") +
    progressPanel() +
    `<div class="task-toolbar"><div class="filters" role="group" aria-label="Filter tasks">${
      ["all", ...categories].map((category) =>
        `<button class="filter ${
          filter === category ? "selected" : ""
        }" aria-pressed="${filter === category}" data-filter="${
          escape(category)
        }">${
          category === "all" ? "All tasks" : escape(label(category))
        }</button>`
      ).join("")
    }</div><span class="eyebrow">${session.checklist.length} TOTAL TASKS</span></div>
    <div class="task-list">${
      session.checklist.filter((item) =>
        filter === "all" || item.category === filter
      ).map((item, index) =>
        `<article class="task panel ${
          item.status === "completed" ? "done" : ""
        }"><div class="task-index">${
          item.status === "completed" ? "✓" : String(index + 1).padStart(2, "0")
        }</div><div class="task-content"><div class="task-meta">${
          escape(label(item.category))
        }<span>${item.required ? "REQUIRED" : "OPTIONAL"}</span></div><h2>${
          escape(displayTaskTitle(item.title))
        }</h2>${item.description ? `<p>${escape(item.description)}</p>` : ""}${
          item.completion
            ? `<p class="completion">Completed by ${
              escape(item.completion.completedBy)
            } · ${escape(formatDateTime(item.completion.completedAt))}</p>`
            : ""
        }</div><div class="task-actions">${chip(item.status)}${
          onboarding.status === "provisioning" &&
            ["pending", "in_progress"].includes(item.status)
            ? `<div>${
              item.status === "pending"
                ? `<button class="secondary compact" data-task="${
                  escape(item.id)
                }" data-status="in_progress">Start</button>`
                : ""
            }<button class="secondary compact" data-task="${
              escape(item.id)
            }" data-status="completed">Complete</button>${
              !item.required
                ? `<button class="secondary compact" data-task="${
                  escape(item.id)
                }" data-status="skipped">Skip</button>`
                : ""
            }</div>`
            : ""
        }</div></article>`
      ).join("")
    }</div>
    <div class="action-bar"><p>The backend validates readiness before verification.</p>${
      onboarding.status === "provisioning"
        ? `<button class="primary" data-action="prepare" ${
          checklistProgress(session.checklist).percent < 100 ? "disabled" : ""
        }>Ready for verification →</button>`
        : ""
    }</div>`;
}

function verification() {
  const onboarding = session.onboarding;
  main.innerHTML = title(
    "03 / FINAL IT REVIEW",
    "Verification gate",
    "Review the recorded request and completed work before approving inventory synchronization.",
  ) +
    progressPanel() +
    `<div class="review-layout"><section class="panel">${
      summary(onboarding, onboarding.accessRequest.finalApplicationIds)
    }</section>${
      section(
        "03",
        "Verification decision",
        `<div class="banner">Approval records the final IT review. Rejection returns this request to provisioning.</div><label class="field">Verification notes <span class="optional">OPTIONAL</span><textarea id="verification-notes" rows="6" placeholder="Record your review or explain any corrections"></textarea></label><div class="decision-actions">${
          button("Reject request", "reject", "danger")
        }${
          button("Approve verification →", "approve")
        }</div><p class="hint">Recorded as demo-user. This demo does not authenticate reviewer identity.</p>`,
      )
    }</div>`;
}

function inventory() {
  const preview = syncPreview(session);
  const onboarding = session.onboarding;
  const complete = onboarding.status === "complete";
  const failed = onboarding.status === "sync_failed";
  main.innerHTML = title(
    "04 / DEMO IDENTITY INVENTORY",
    complete
      ? "Onboarding complete"
      : failed
      ? "Inventory sync failed"
      : "Ready to sync",
    complete
      ? "Employee inventory synchronized successfully to the local demo."
      : "Review the manifest before writing to the local, in-memory inventory.",
  ) +
    `<div class="metrics"><div class="metric"><p class="eyebrow">REQUIRED TASKS</p><strong>${preview.progress.completed}<span> / ${preview.progress.total}</span></strong></div><div class="metric"><p class="eyebrow">VERIFICATION</p><strong class="success-text">${
      escape(label(preview.verification))
    }</strong></div><div class="metric"><p class="eyebrow">APPLICATION GRANTS</p><strong>${preview.applications.length}</strong></div></div>` +
    `<div class="review-layout"><section class="panel"><div class="section-heading"><span class="section-number">04</span><h2>Sync manifest</h2>${
      chip(complete ? "synchronized" : "preview")
    }</div><div class="summary-block"><p class="eyebrow">TARGET / DEMO IDENTITY INVENTORY</p><dl class="details">${
      pair("Employee", preview.employee)
    }${pair("Department", preview.department)}${
      pair("Manager", preview.manager)
    }${
      pair("Start date", preview.startDate)
    }</dl></div><div class="summary-block"><p class="eyebrow">CORE ACCOUNTS</p>${
      preview.coreAccounts.map((account) =>
        `<p class="small-title">${
          escape(label(account.service))
        }</p><div class="chips">${chips(account.workspaceIds)}</div>`
      ).join("")
    }</div><div class="summary-block"><p class="eyebrow">FINAL APPLICATION ACCESS</p><div class="chips">${
      chips(preview.applications.map(appName))
    }</div></div></section>
    ${
      section(
        "→",
        complete ? "Inventory synchronized" : "Commit to local inventory",
        complete
          ? `<div class="completion-emblem" aria-hidden="true">✓</div><h3>${
            escape(preview.employee)
          }</h3><p>Verification approved. Required checklist complete. Demo inventory synchronized.</p>${
            button("Start new onboarding →", "new")
          }<p class="hint">Starts a new draft. This onboarding remains in the running server's memory.</p>`
          : failed
          ? `<div class="banner warning">Sync failed. The session and audit history have been preserved. This demo does not support executing a connector retry from failed state.</div>${
            button("Reload current session", "reload", "secondary")
          }`
          : onboarding.status === "verified"
          ? `<p>Writes only to Demo Identity Inventory. No external systems or accounts are changed.</p><form id="sync-form">${
            field("personReference", "Stable demo person reference", {
              value: demoPersonReference(
                onboarding.employee.firstName,
                onboarding.employee.lastName,
              ),
            })
          }<p class="hint">Reuse this reference for the same fictional person. It is separate from the onboarding reference.</p><button class="primary" type="submit">Commit to inventory →</button></form>`
          : `<p>Synchronization is in progress. Reload to read the server's current state.</p>${
            button("Reload current session", "reload", "secondary")
          }`,
      )
    }</div>
    <section class="panel audit"><div class="section-heading"><h2>Recent workflow events</h2></div>${
      session.auditEvents.slice(-5).map((event) =>
        `<div class="audit-row"><span>${
          escape(label(event.eventType))
        }</span><span>${escape(event.actor)}</span><time>${
          escape(formatDateTime(event.timestamp))
        }</time></div>`
      ).join("")
    }</section>`;
  document.querySelector("#sync-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const reference = new FormData(event.currentTarget).get("personReference")
      .trim();
    if (!reference) {
      showMessage("Enter a nonblank fictional person reference.", "error");
      return;
    }
    run(async () => {
      const result = await api.sync(session.onboarding.id, reference);
      accept(result.session);
    });
  });
}

function showMessage(text, kind = "info") {
  message = text;
  messageKind = kind;
  notice.innerHTML = text
    ? `<div class="banner ${kind}" ${kind === "error" ? 'role="alert"' : ""}>${
      escape(text)
    }</div>`
    : "";
}

function render(focus = false) {
  const step = workflowStep(session?.onboarding.status);
  document.querySelector("#steps").innerHTML = `<ol>${
    ["Intake", "IT Checklist", "Verification", "Inventory Sync"].map((
      name,
      index,
    ) =>
      `<li class="${
        index === step
          ? "current"
          : index < step || session?.onboarding.status === "complete"
          ? "finished"
          : ""
      }" ${
        index === step ? 'aria-current="step"' : ""
      }><span class="step-number">${
        index < step || session?.onboarding.status === "complete"
          ? "✓"
          : `0${index + 1}`
      }</span><span>${name}</span><span class="step-line"></span></li>`
    ).join("")
  }</ol>`;
  if (!session) reviewing ? review() : intake();
  else if (session.onboarding.status === "draft") {
    main.innerHTML = title(
      "01 / DRAFT CREATED",
      "Ready to submit",
      "Your draft was saved. Continue through submission and provisioning.",
    ) +
      `<section class="panel">${
        summary(
          session.onboarding,
          session.onboarding.accessRequest.finalApplicationIds,
        )
      }</section><div class="action-bar">${
        button("Submit & start provisioning →", "advance")
      }</div>`;
  } else if (step === 1) checklist();
  else if (step === 2) verification();
  else inventory();
  if (session) {
    main.insertAdjacentHTML(
      "beforeend",
      `<div class="session-foot"><span>REQUEST / ${
        escape(session.onboarding.id)
      }</span>${
        button("Reload current session", "reload", "text-button")
      }</div>`,
    );
  }
  showMessage(message, messageKind);
  if (focus) main.focus();
}

async function advance() {
  if (session.onboarding.status === "draft") {
    accept(await api.action(session.onboarding.id, "submit"));
  }
  if (session.onboarding.status === "submitted") {
    accept(await api.action(session.onboarding.id, "provisioning/start"));
  }
}

async function run(operation) {
  if (busy) return;
  busy = true;
  showMessage("Working with the local API…");
  main.setAttribute("aria-busy", "true");
  for (
    const control of main.querySelectorAll("button, input, select, textarea")
  ) control.disabled = true;
  try {
    await operation();
    message = "";
  } catch (error) {
    if (error instanceof ApiError && error.session) accept(error.session);
    message = error instanceof ApiError
      ? error.message
      : "The operation could not be completed. Reload the current session to check its state.";
    messageKind = "error";
  } finally {
    busy = false;
    main.removeAttribute("aria-busy");
    render(true);
  }
}

main.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target || target.disabled || busy) return;
  if (target.dataset.filter) {
    filter = target.dataset.filter;
    render();
    return;
  }
  if (target.dataset.task) {
    run(async () =>
      accept(
        await api.checklist(
          session.onboarding.id,
          target.dataset.task,
          target.dataset.status,
        ),
      )
    );
    return;
  }
  const action = target.dataset.action;
  if (action === "edit") {
    reviewing = false;
    render(true);
  }
  if (action === "new") {
    session = undefined;
    draft = undefined;
    requestMetadata = createRequestMetadata();
    reviewing = false;
    filter = "all";
    remember();
    message = "";
    render(true);
  }
  if (action === "create") {
    run(async () => {
      accept(await api.create(intakeInput(draft, requestMetadata)));
      await advance();
    });
  }
  if (action === "advance") run(advance);
  if (action === "prepare") {
    run(async () =>
      accept(await api.action(session.onboarding.id, "verification/prepare"))
    );
  }
  if (action === "approve" || action === "reject") {
    const notes = document.querySelector("#verification-notes").value;
    run(async () =>
      accept(
        await api.verify(
          session.onboarding.id,
          action === "approve" ? "approved" : "rejected",
          notes,
        ),
      )
    );
  }
  if (action === "reload") run(reload);
});

async function reload() {
  let id = session?.onboarding.id;
  try {
    id ??= localStorage.getItem(storageKey);
  } catch { /* Optional storage. */ }
  if (!id) return;
  try {
    accept(await api.get(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      remember();
      session = undefined;
      reviewing = false;
      throw new ApiError(
        "The saved onboarding is no longer available. The local server may have restarted. Start a new request below.",
        404,
        "SESSION_GONE",
      );
    }
    throw error;
  }
}

try {
  config = await api.configuration();
  try {
    await reload();
  } catch (error) {
    message = error instanceof ApiError
      ? error.message
      : "Unable to restore the current session.";
    messageKind = "warning";
  }
  render();
} catch {
  main.innerHTML =
    `<section class="panel"><h1>Local server unavailable</h1><p>Start AccessFlow and reload this page to try again.</p><button class="primary" id="retry-load">Reload page</button></section>`;
  document.querySelector("#retry-load").addEventListener(
    "click",
    () => location.reload(),
  );
}
