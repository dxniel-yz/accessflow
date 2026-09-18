export type CoreAccountService = "google_workspace" | "slack";

export interface CoreAccountRequest {
  service: CoreAccountService;
  /** Configured workspace/environment IDs: empty means none, multiple means each. */
  workspaceIds: readonly string[];
}

export interface Application {
  id: string;
  displayName: string;
  description?: string;
  active: boolean;
}

export interface AccessPackage {
  id: string;
  displayName: string;
  description?: string;
  /** Descriptive scope only; these fields do not automatically match employees. */
  department?: string;
  role?: string;
  defaultApplicationIds: readonly string[];
}

export interface AccessRequest {
  accessPackageId?: string;
  /** Snapshot of inherited defaults, independent of later package changes. */
  defaultApplicationIds: readonly string[];
  addedApplicationIds: readonly string[];
  removedApplicationIds: readonly string[];
  /** Explicit snapshot; V0.2 does not calculate or reconcile application access. */
  finalApplicationIds: readonly string[];
}
