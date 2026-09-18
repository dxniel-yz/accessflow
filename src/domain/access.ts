export type CoreAccountService = "google_workspace" | "slack";

export interface CoreAccountRequest {
  service: CoreAccountService;
  /** Configured workspace/environment IDs: empty means none, multiple means each. */
  workspaceIds: readonly string[];
}

export interface ProvisioningTaskTemplate {
  /** Stable ID, unique within the application. */
  id: string;
  title: string;
  description?: string;
}

export interface Application {
  id: string;
  displayName: string;
  description?: string;
  active: boolean;
  /** Omitted or empty templates use a generic provisioning task. */
  provisioningTasks?: readonly ProvisioningTaskTemplate[];
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
  /** Explicit snapshot; callers can calculate it with the access resolver. */
  finalApplicationIds: readonly string[];
}
