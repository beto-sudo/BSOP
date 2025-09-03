export type UUID = string;

export type ModuleKey =
  | "purchases"
  | "inventory"
  | "sales"
  | "cash"
  | "customers"
  | "settings"
  | "reports"
  | "catalogs";

export type PermissionKey =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "export"
  | "admin";

export type PermissionMatrix = Record<ModuleKey, Partial<Record<PermissionKey, boolean>>>;

export interface EffectivePermission {
  module: ModuleKey;
  permissions: Partial<Record<PermissionKey, boolean>>;
}
