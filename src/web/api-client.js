// @ts-check
/** @typedef {import('../application/index.ts').OnboardingSession} Session */
/** @typedef {import('../application/index.ts').CreateOnboardingInput} CreateInput */

export class ApiError extends Error {
  /** @param {string} message @param {number} status @param {string} code @param {Session | undefined} [session] */
  constructor(message, status, code, session) {
    super(message);
    this.status = status;
    this.code = code;
    this.session = session;
  }
}

/** Local audit identity is not authenticated. Inject fetch/clock for deterministic tests. */
export class ApiClient {
  /** @param {typeof fetch} [transport] @param {() => Date} [clock] */
  constructor(
    transport = globalThis.fetch.bind(globalThis),
    clock = () => new Date(),
  ) {
    this.transport = transport;
    this.clock = clock;
    this.sequence = 0;
  }

  /** @param {string} path @param {unknown} [body] @param {string} [actor] */
  async request(path, body, actor = "demo-user") {
    const timestamp = this.clock().toISOString();
    let response;
    try {
      response = await this.transport(
        path,
        body === undefined ? {} : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-event-id": `web:${timestamp}:${++this.sequence}`,
            "x-actor": actor,
            "x-timestamp": timestamp,
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new ApiError(
        "The local server could not be reached. Check that it is running, then reload the current session.",
        0,
        "NETWORK_ERROR",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        "The server returned an unreadable response.",
        response.status,
        "INVALID_RESPONSE",
      );
    }
    if (!response.ok) {
      throw new ApiError(
        result.error?.message ?? "The request failed.",
        response.status,
        result.error?.code ?? "REQUEST_FAILED",
        result.session,
      );
    }
    return result;
  }

  /** @returns {Promise<import('../application/index.ts').OnboardingConfiguration & {workspaceIds: string[]}>} */
  configuration() {
    return this.request("/web/config.json");
  }
  /** @param {CreateInput} input @returns {Promise<Session>} */
  create(input) {
    return this.request("/api/onboardings", input, input.requestedBy);
  }
  /** @param {string} id @returns {Promise<Session>} */
  get(id) {
    return this.request(`/api/onboardings/${encodeURIComponent(id)}`);
  }
  /** @param {string} id @param {string} action @param {unknown} [body] @returns {Promise<Session>} */
  action(id, action, body = {}) {
    return this.request(
      `/api/onboardings/${encodeURIComponent(id)}/${action}`,
      body,
    );
  }
  /** @param {string} id @param {string} itemId @param {'in_progress'|'completed'|'skipped'} status @returns {Promise<Session>} */
  checklist(id, itemId, status) {
    return this.action(id, `checklist/${encodeURIComponent(itemId)}`, {
      status,
    });
  }
  /** @param {string} id @param {'approved'|'rejected'} decision @param {string} notes @returns {Promise<Session>} */
  verify(id, decision, notes) {
    return this.action(id, "verification", {
      decision,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  }
  /** @param {string} id @param {string} personReference @returns {Promise<{ok: true, session: Session}>} */
  sync(id, personReference) {
    return this.request(`/api/onboardings/${encodeURIComponent(id)}/sync`, {
      personReference,
    });
  }
  /** @returns {Promise<import('../connectors/demo-identity-inventory-connector.ts').DemoInventoryRecord[]>} */
  inventory() {
    return this.request("/api/demo/inventory");
  }
}
