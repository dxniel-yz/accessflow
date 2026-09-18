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
but no gate or state transitions are enforced yet. Audit metadata supports
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

## Project structure

```text
src/
  domain/             Domain types and public index.ts exports
  services/           Pure access resolver and checklist generator
  demo/               Fictional application catalog
  app.ts              HTTP request handler
  main.ts             Local server entry point
tests/
  domain/             Domain model tests
  services/           Business logic tests and test helpers
  health_test.ts      Health endpoint test
deno.json             Deno tasks and TypeScript configuration
.env.example          Commented configuration placeholder
.gitignore            Local and generated file exclusions
README.md             Project overview and local setup
```
