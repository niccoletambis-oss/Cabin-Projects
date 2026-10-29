export function stockLevel(quantity: number, minimum: number) {
  return quantity === 0
    ? "OUT OF STOCK"
    : quantity > minimum
      ? "NORMAL"
      : quantity <= Math.max(1, Math.floor(minimum / 2))
        ? "CRITICAL"
        : "LOW STOCK";
}
export function suggestedOrder(
  quantity: number,
  minimum: number,
  reorder: number,
) {
  return Math.max(reorder, minimum + 1 - quantity, 0);
}
export function auditFlag(expected: number, actual: number, condition: string) {
  return condition === "MISSING" || (actual === 0 && expected > 0)
    ? "Missing"
    : ["DAMAGED", "FOR_REPAIR", "FOR_REPLACEMENT"].includes(condition)
      ? "Damaged"
      : actual < expected
        ? "Shortage"
        : actual > expected
          ? "Excess"
          : "Complete";
}
