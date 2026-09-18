export type LaptopPlatform = "macOS" | "Windows";
export type DeviceRequirements = "standard" | "custom/high-performance";

/** Every onboarding requests one company-owned laptop. */
export interface EquipmentRequest {
  platform: LaptopPlatform;
  deviceRequirements: DeviceRequirements;
  /** Optional workload details, primarily for custom/high-performance requests. */
  workloadRequirements?: string;
}
