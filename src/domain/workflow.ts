export type OnboardingStatus =
  | "draft"
  | "submitted"
  | "provisioning"
  | "ready_for_verification"
  | "verified"
  | "syncing"
  | "complete"
  | "sync_failed";

export type ChecklistStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

export interface CompletionMetadata {
  completedBy: string;
  /** ISO 8601 timestamp; runtime validation is deferred. */
  completedAt: string;
}

export type ChecklistItem =
  & {
    id: string;
    title: string;
    description?: string;
    /** Caller-defined category, independent of any external system. */
    category: string;
    required: boolean;
  }
  & (
    | { status: "completed"; completion: CompletionMetadata }
    | {
      status: Exclude<ChecklistStatus, "completed">;
      completion?: never;
    }
  );

export type VerificationStatus = "pending" | "approved" | "rejected";

/** A future synchronization gate can explicitly require status === "approved". */
export type Verification =
  & { notes?: string }
  & (
    | { status: "pending"; verifiedBy?: never; verifiedAt?: never }
    | {
      status: "approved" | "rejected";
      verifiedBy: string;
      /** ISO 8601 timestamp; runtime validation is deferred. */
      verifiedAt: string;
    }
  );
