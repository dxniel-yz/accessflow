export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface AuditEvent {
  id: string;
  onboardingId: string;
  /** Caller-defined event name; no event processing is implemented. */
  eventType: string;
  actor: string;
  /** ISO 8601 timestamp; runtime validation is deferred. */
  timestamp: string;
  metadata?: { readonly [key: string]: JsonValue };
}
