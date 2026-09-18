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
and final application IDs separately. These are explicit snapshots, with no
access calculation or package matching. ID arrays represent sets by convention;
uniqueness and reference validation are deferred. Manager and actor fields are
opaque string references. Calendar dates use `YYYY-MM-DD`; event timestamps use
ISO 8601 strings. V0.2 does not validate these formats at runtime.

Completed checklist items require completion metadata. Approved or rejected
verification records require an actor and timestamp; new requests can record
pending verification. The explicit approval status supports a future sync gate,
but no gate or state transitions are enforced yet. Audit metadata supports
nested JSON values. TypeScript constraints are compile-time checks, not input
validation.

There is no UI, database, authentication, rules engine, checklist generation,
audit storage, or external integration. The existing health endpoint is
unchanged.

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

## Project structure

```text
src/
  domain/             Domain types and public index.ts exports
  app.ts              HTTP request handler
  main.ts             Local server entry point
tests/
  domain/             Domain model tests
  health_test.ts      Health endpoint test
deno.json             Deno tasks and TypeScript configuration
.env.example          Commented configuration placeholder
.gitignore            Local and generated file exclusions
README.md             Project overview and local setup
```
