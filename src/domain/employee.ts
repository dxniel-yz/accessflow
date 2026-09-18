export type EmploymentType = "salary" | "hourly" | "contractor";
export type WorkLocation = "onsite" | "hybrid" | "remote";

export interface Employee {
  firstName: string;
  lastName: string;
  preferredName?: string;
  personalEmail?: string;
  jobTitle: string;
  department: string;
  /** Caller-provided manager reference; no directory integration is assumed. */
  manager: string;
  employmentType: EmploymentType;
  /** Calendar date in YYYY-MM-DD form; runtime validation is deferred. */
  startDate: string;
  workLocation: WorkLocation;
}
