import type {
  CoreAccountService,
  EmploymentType,
  WorkLocation,
} from "../domain/index.ts";

export interface InventoryPerson {
  /** Stable caller-owned identity key, independent of onboarding request IDs. */
  readonly reference: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredName?: string;
  readonly jobTitle: string;
  readonly department: string;
  readonly employmentType: EmploymentType;
  readonly workLocation: WorkLocation;
  readonly startDate: string;
  readonly coreAccounts: readonly {
    readonly service: CoreAccountService;
    readonly workspaceIds: readonly string[];
  }[];
}

export interface InventorySyncSnapshot {
  readonly person: InventoryPerson;
  readonly managerReference: string;
  readonly applicationIds: readonly string[];
}

/** Implementations resolve neutral references; vendor mappings stay behind this boundary. */
export interface IdentityInventoryConnector {
  upsertPerson(person: InventoryPerson): Promise<void>;
  setManager(personReference: string, managerReference: string): Promise<void>;
  syncApplicationAccess(
    personReference: string,
    applicationIds: readonly string[],
  ): Promise<void>;
}
