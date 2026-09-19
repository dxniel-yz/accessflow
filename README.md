# AccessFlow

AccessFlow is a vendor-neutral IT identity lifecycle automation platform,
starting with employee onboarding.

V0.1 establishes a lightweight Deno 2 and TypeScript foundation: a minimal HTTP
server, a health endpoint, and an automated endpoint handler test. It uses no
third-party dependencies, frontend framework, or database.

Future versions may add an onboarding request form, dynamic IT provisioning
checklists, a verification gate, audit logging, and optional synchronization
with external asset systems. These features and integrations are outside V0.1
scope.

## V0.2 domain model

V0.2 adds TypeScript-only domain models exported from `src/domain/index.ts`:
employees, core account requests, applications, access packages, access
requests, company-owned laptop requests, onboarding requests, checklist items,
verification, and audit events. Google Workspace and Slack are account service
identifiers only; workspace/environment IDs are caller-configured strings. An
empty selection means none, and multiple IDs request access in each selected
environment.

Access requests record inherited defaults, manual additions, manual removals,
and final application IDs separately. These are explicit snapshots; V0.2 did not
include access calculation or package matching. ID arrays represent sets by
convention. Manager and actor fields are opaque string references. Calendar
dates use `YYYY-MM-DD`; event timestamps use ISO 8601 strings. V0.2 does not
validate these formats at runtime.

Completed checklist items require completion metadata. Approved or rejected
verification records require an actor and timestamp; new requests can record
pending verification. The explicit approval status supports a future sync gate,
but V0.2 did not enforce gates or state transitions. Audit metadata supports
nested JSON values. TypeScript constraints are compile-time checks, not input
validation.

V0.2 introduced models only. The existing health endpoint is unchanged.

## V0.3 access resolution and checklist generation

`resolveApplicationAccess(defaults, additions, removals)` in
`src/services/access-resolver.ts` returns unique application IDs in first-seen
order: defaults first, additions second, with removals always taking precedence.
It does not mutate its inputs or select an access package automatically.

`generateChecklist(request, applications)` in
`src/services/checklist-generator.ts` creates core account tasks for each
selected workspace/environment, configured application tasks, and one company
laptop task. Custom/high-performance laptops also receive a required workload
review task before device preparation, with `workloadRequirements` included when
provided. Workspace IDs appear directly in account task titles.

Applications can define optional `provisioningTasks` containing stable IDs,
titles, and optional descriptions. Omitted or empty templates use a generic
access task. `src/demo/applications.ts` contains clearly labeled generic demo
configuration, not production procedures.

The generator uses the request's `finalApplicationIds` as supplied; callers can
use the resolver to calculate that snapshot first. Tasks follow account
selection, final application, and template order, then equipment. Duplicate
account selections and final application IDs produce only one set of tasks.
Unknown or inactive requested applications, duplicate catalog IDs, and duplicate
template IDs within a requested application raise errors rather than silently
dropping work.

Checklist IDs use encoded onboarding, category, and task identifiers, so
repeated generation is deterministic. Every generated item is required and
pending with no completion metadata. Both services are pure and leave inputs
unchanged. Generation creates a fresh checklist; it does not merge existing
completion records or enforce task dependencies or workflow transitions.

V0.3 does not provision accounts, integrate with external systems, synchronize
Assets, expose new API endpoints, provide a UI or authentication, or persist
data.

## V0.4 in-memory onboarding workflow

Pure services now support explicit onboarding transitions, immutable checklist
operations, final verification, and audit event creation. Existing domain types
are unchanged.

- `transitionOnboarding` in `src/services/onboarding-workflow.ts` permits
  `draft -> submitted -> provisioning -> ready_for_verification`, with readiness
  requiring every required checklist item to be completed. After verification,
  it permits `verified -> syncing`, `syncing -> complete` or `sync_failed`, and
  `sync_failed -> syncing` for a modeled retry. Other transitions raise
  `WorkflowError`; ordinary transitions cannot approve or reject verification.
- `transitionChecklistItem` in `src/services/checklist-lifecycle.ts` returns a
  new checklist. Pending tasks can start or complete; in-progress tasks can
  complete. Optional pending or in-progress tasks can also be skipped. Completed
  and skipped tasks are terminal. Required tasks cannot be skipped. Completion
  records `completedBy` and `completedAt` from the action's actor and timestamp.
- `isReadyForVerification` checks only required items. Optional pending,
  in-progress, completed, or skipped items do not block readiness. Empty and
  optional-only checklists are ready under this rule; callers must supply the
  full checklist associated with the onboarding.
- `verifyOnboarding` in `src/services/verification.ts` accepts approval or
  rejection only in `ready_for_verification`, and checks required completion
  again. Approval records verification and moves to `verified`; rejection
  records verification and returns to `provisioning`. Both record `verifiedBy`,
  `verifiedAt`, and optional notes. A rejection remains recorded through renewed
  readiness until the next decision replaces it.

Each operation accepts an `ActionContext` with a caller-supplied `eventId`,
`actor`, and ISO 8601 `timestamp`, and returns updated state plus an `event`.
These fields must be nonblank; timestamp format validation remains deferred. The
shared `createAuditEvent` factory in `src/services/audit-events.ts` preserves
caller IDs and optional JSON metadata without randomness or clock reads.
Workflow events record old/new statuses; checklist events also identify the
task. Callers must assign distinct event IDs for distinct actions and retain
events themselves.

This remains an in-memory business-logic layer. There is no persistence, global
audit log, authentication, UI, background job, onboarding HTTP API, external
account provisioning, or Atlassian synchronization. Sync statuses only model a
future integration; transitioning to them performs no external work.

## V0.5 application/use-case orchestration

`src/application/index.ts` exports an in-memory `OnboardingSession`: an
`onboarding` request, its `checklist`, and ordered `auditEvents`. Operations
return new independent snapshots, leaving prior sessions and caller
configuration unchanged.

`createOnboarding(input, configuration, context)` selects the optional
`input.accessPackageId` from `configuration.accessPackages`. Missing or
ambiguous selected packages fail explicitly. Without a selection, defaults are
empty. The operation reuses access resolution to snapshot defaults, additions,
removals, and final access; creates a draft request with pending verification;
generates the checklist from `configuration.applications`; and starts history
with `onboarding_created`. Input supplies employee, core accounts, equipment,
request identity/date, manual access exceptions, and optional notes.

The remaining use cases compose existing services and append their audit events:

- `submitOnboarding(session, context)` and
  `startProvisioning(session, context)`.
- `updateChecklistItem(session, itemId, target, context)` for existing checklist
  lifecycle transitions.
- `prepareForVerification(session, context)` using the required-item readiness
  gate, and `verifyOnboarding(session, decision, context, notes?)` for approval
  or rejection.
- `startSync`, `completeSync`, `failSync`, and `retrySync`, each taking a
  session and context. Initial sync and retry are distinct operations.

All operations accept caller-controlled audit IDs, actors, and timestamps. Audit
history preserves insertion order without sorting timestamps. Callers remain
responsible for distinct event IDs. The application layer imports the existing
access resolver, checklist generator/lifecycle, workflow transition,
verification, and audit services rather than duplicating their rules.

Sync operations are **state only** and perform no external network calls. There
is still no persistence, authentication, UI, onboarding HTTP API, Atlassian
integration, background processing, or real account provisioning. Fictional
application-layer fixtures live in `tests/application/fixtures.ts`.

## V0.6 identity inventory connector boundary

`IdentityInventoryConnector` in `src/connectors/identity-inventory-connector.ts`
defines asynchronous `upsertPerson`, `setManager`, and `syncApplicationAccess`
operations using vendor-neutral types. `InventoryPerson` contains inventory
profile fields and requested core accounts. `InventorySyncSnapshot` adds the
manager reference and final application IDs; it excludes personal email,
checklists, audit history, and verification internals.

`prepareInventorySync(session, personReference)` creates a detached, deeply
frozen snapshot. The caller supplies a stable person reference, independent of
onboarding request IDs, and must reuse it for the same person. Preparation and
execution require exactly `verified` onboarding status and approved
verification. All other statuses, including `sync_failed`, are rejected before
connector calls. V0.6 does not execute connector retries from failed sessions.

`synchronizeInventory(session, personReference, connector, contexts)` is
exported from `src/application/index.ts`. Callers supply `started`, `completed`,
and `failed` action contexts, with distinct event IDs unused in session history.
All contexts are validated before connector calls. The operation reuses
`startSync`, then calls person upsert, manager linking, and desired application
access synchronization in order. It reuses `completeSync` on success or
`failSync` on connector failure:

- Success returns `{ ok: true, session }` with status `complete`.
- Connector failure returns `{ ok: false, session, error }` with status
  `sync_failed`, the original thrown value, and both start/failure audit events.
- Invalid preconditions throw before connector operations. Earlier connector
  writes may remain if a later operation fails; no transaction or rollback is
  implied.

`DemoIdentityInventoryConnector` stores records in memory keyed by the stable
person reference. Repeated upserts update one record; application
synchronization replaces desired access with unique IDs, including clearing
access with an empty array. `getRecords()` returns independent copies for
inspection. Manager references are recorded directly; future implementations can
resolve them in their own inventory. Use fictional records only with this demo.

The demo connector performs no network requests and does not connect to
Atlassian or any external system. A future connector can implement the same
contract without changing the onboarding domain/workflow. There is no
persistence, authentication, UI, or real account provisioning. Business services
read no clock and generate no random event IDs.

## V0.7 local HTTP/JSON demo API

The local server now exposes an in-memory API that drives the existing
application functions. `createApiHandler` in `src/api/router.ts` accepts an
injected session repository, demo connector, and configuration. Tests call it
with Request/Response objects without opening a TCP port. The default uses
fictional demo applications and the `demo-engineering` access package.

`OnboardingSessionRepository` defines `save` and `getById`.
`InMemoryOnboardingSessionRepository` clones on save/retrieval, replaces
snapshots with the same ID, and returns `undefined` for missing IDs. POST
creation rejects existing IDs rather than overwriting them. Requests are
serialized within each handler instance to avoid overlapping state updates; this
is not distributed concurrency control. State and demo inventory disappear on
process restart.

| Method | Route                                       | Operation                        |
| ------ | ------------------------------------------- | -------------------------------- |
| GET    | `/health`                                   | Existing health response         |
| POST   | `/api/onboardings`                          | Create draft; returns 201        |
| GET    | `/api/onboardings/:id`                      | Retrieve session                 |
| POST   | `/api/onboardings/:id/submit`               | Submit                           |
| POST   | `/api/onboardings/:id/provisioning/start`   | Start provisioning               |
| POST   | `/api/onboardings/:id/checklist/:itemId`    | Transition checklist item        |
| POST   | `/api/onboardings/:id/verification/prepare` | Check readiness                  |
| POST   | `/api/onboardings/:id/verification`         | Approve or reject                |
| POST   | `/api/onboardings/:id/sync`                 | Synchronize local demo inventory |
| GET    | `/api/demo/inventory`                       | Inspect copied demo records      |

POST requests use JSON and require `x-event-id`, `x-actor`, and `x-timestamp`
headers. Supply a unique event ID, a fictional actor such as `demo-user`, and an
ISO 8601 timestamp. No clock or random generator is used. Sync derives its three
event IDs by appending `:started`, `:completed`, and `:failed` to the supplied
ID. Server-owned audit identities and timestamps are future work; headers
provide no authentication. Date/email format validation is not yet implemented.

Creation accepts the `CreateOnboardingInput` shape, for example:

```json
{
  "id": "demo-onboarding-001",
  "employee": {
    "firstName": "Alex",
    "lastName": "Morgan",
    "jobTitle": "Software Engineer",
    "department": "Engineering",
    "manager": "demo-manager",
    "employmentType": "salary",
    "startDate": "2026-10-02",
    "workLocation": "remote"
  },
  "coreAccountRequests": [],
  "equipmentRequest": { "platform": "macOS", "deviceRequirements": "standard" },
  "accessPackageId": "demo-engineering",
  "addedApplicationIds": ["analytics"],
  "removedApplicationIds": ["project-management"],
  "requestedBy": "demo-user",
  "requestDate": "2026-10-01T12:00:00Z"
}
```

Submit, start provisioning, and prepare verification accept `{}`. Checklist
updates accept `{"status":"completed"}` (also `in_progress` or `skipped`).
Verification accepts `{"decision":"approved","notes":"Demo review passed"}` or
`rejected`. Sync requires `{"personReference":"demo-person"}`. URL-encode
onboarding and checklist IDs when placing them in route segments.

Boundary validation checks JSON objects, required fields, strings, arrays, and
enum values. Workflow rules remain in the existing services. Errors use
`{"error":{"code":"...","message":"..."}}`: malformed/invalid requests return
400, missing routes/sessions 404, workflow conflicts 409, and unexpected
failures 500 without stack traces. Sync returns `{ok:true,session}` on success
or `{ok:false,session,error}` with 500 on connector failure; either resulting
session is saved, including failed state and audit history.

The demo connector remains local and memory-only: no Atlassian or external
integration, real account provisioning, database persistence, UI, or
authentication is implemented. V0.7 is a local/demo API, not production ready.
Because authentication and authorization do not exist, do not expose it as a
production service or place it on a public network with sensitive data. The
default binding remains `127.0.0.1:8000`.

## Prerequisites

- Deno 2 installed and available on your PATH (`deno --version`).
- No Node.js, package installation, credentials, or external services required.

## Run locally

From the project directory, start the development server with automatic reload:

```sh
deno task dev
```

To start without automatic reload:

```sh
deno task start
```

The server listens locally at `http://127.0.0.1:8000`. Stop it with Ctrl+C.

```sh
curl http://127.0.0.1:8000/health
```

`GET /health` returns HTTP 200 with JSON:

```json
{ "status": "healthy" }
```

Other requests return HTTP 404 with a JSON error.

No environment configuration is needed. `.env.example` contains only a commented
placeholder for future configuration; V0.1 does not load `.env` files. Local
environment files are ignored by Git.

## Development checks

```sh
deno task fmt
deno task lint
deno task test
```

The health test exercises the request handler directly, checking the status
code, JSON content type, and healthy response body without opening a network
port. Domain tests cover representative records, access snapshots, configured
workspace selections, JSON serialization, and compile-time type constraints.
Service tests cover access resolution, configuration-driven checklist
generation, deterministic IDs, invalid configuration, and input immutability.
Workflow tests cover allowed and forbidden state transitions, checklist
lifecycle, verification gates and decisions, audit events, and immutable
updates. Application tests exercise complete onboarding flows,
rejection/reapproval, sync failure/retry, preserved business rules, and
independent session snapshots.

## Project structure

```text
src/
  api/                HTTP routing, validation, and JSON error mapping
  infrastructure/     In-memory session repository
  connectors/         Vendor-neutral contract and memory-only demo inventory
  application/        In-memory onboarding sessions and use-case orchestration
  domain/             Domain types and public index.ts exports
  services/           Pure access, checklist, workflow, verification, and audit logic
  demo/               Fictional application catalog
  app.ts              HTTP request handler
  main.ts             Local server entry point
tests/
  application/        Orchestration flow tests and fictional fixtures
  domain/             Domain model tests
  services/           Business logic tests and test helpers
  health_test.ts      Health endpoint test
deno.json             Deno tasks and TypeScript configuration
.env.example          Commented configuration placeholder
.gitignore            Local and generated file exclusions
README.md             Project overview and local setup
```
