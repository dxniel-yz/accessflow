import type {
  IdentityInventoryConnector,
  InventoryPerson,
} from "./identity-inventory-connector.ts";

export interface DemoInventoryRecord {
  person: InventoryPerson;
  managerReference?: string;
  applicationIds: string[];
}

/** Demo only: memory storage, no I/O. Supply fictional records only. */
export class DemoIdentityInventoryConnector
  implements IdentityInventoryConnector {
  private readonly records = new Map<string, DemoInventoryRecord>();

  upsertPerson(person: InventoryPerson): Promise<void> {
    const previous = this.records.get(person.reference);
    this.records.set(person.reference, {
      ...previous,
      person: structuredClone(person),
      applicationIds: previous?.applicationIds ?? [],
    });
    return Promise.resolve();
  }

  setManager(personReference: string, managerReference: string): Promise<void> {
    this.requirePerson(personReference).managerReference = managerReference;
    return Promise.resolve();
  }

  syncApplicationAccess(
    personReference: string,
    applicationIds: readonly string[],
  ): Promise<void> {
    this.requirePerson(personReference).applicationIds = [
      ...new Set(applicationIds),
    ];
    return Promise.resolve();
  }

  /** Return copies so demo inspection cannot change stored records. */
  getRecords(): DemoInventoryRecord[] {
    return structuredClone([...this.records.values()]);
  }

  private requirePerson(reference: string): DemoInventoryRecord {
    const record = this.records.get(reference);
    if (!record) throw new Error(`Unknown person reference: ${reference}`);
    return record;
  }
}
