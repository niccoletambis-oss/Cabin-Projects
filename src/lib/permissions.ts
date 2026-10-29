import type { Role } from "@prisma/client";
export type Actor = { id: string; name: string; role: Role };
export type Permission =
  | "inventory:view"
  | "inventory:edit"
  | "stock"
  | "users"
  | "suppliers"
  | "purchase:create"
  | "purchase:approve"
  | "purchase:receive"
  | "audit"
  | "review"
  | "reports"
  | "logs"
  | "finance"
  | "rooms:view"
  | "rooms:manage"
  | "linen"
  | "booking:view"
  | "booking:manage"
  | "inspection"
  | "charge:review"
  | "charge:approve"
  | "expense:submit"
  | "expense:manage";
export function can(role: Role, permission: Permission) {
  if (role === "ADMIN") return true;
  if (role === "MANAGER")
    return !["users", "purchase:approve", "charge:approve"].includes(
      permission,
    );
  return [
    "inventory:view",
    "stock",
    "audit",
    "rooms:view",
    "linen",
    "booking:view",
    "inspection",
    "expense:submit",
  ].includes(permission);
}
export function authorize(
  actor: Actor | null | undefined,
  permission: Permission,
): asserts actor is Actor {
  if (!actor) throw new Error("Authentication required");
  if (!can(actor.role, permission)) throw new Error("Permission denied");
}
