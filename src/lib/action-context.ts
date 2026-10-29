const intents = new Set([
  "add",
  "stock",
  "password",
  "user",
  "supplier",
  "item",
  "damage",
  "review-damage",
  "start-audit",
  "complete-audit",
  "review-audit",
  "purchase",
  "transition-purchase",
  "room",
  "room-line",
  "linen-register",
  "linen-move",
  "booking",
  "booking-cancel",
  "inspection-start",
  "inspection-save",
  "inspection-issue",
  "guest-charge",
  "charge-transition",
  "expense",
  "expense-review",
  "attachment",
  "private-evidence",
  "archive-file",
  "restore-file",
  "booking-privacy",
]);
export function actionContext(value: FormDataEntryValue | null) {
  return typeof value === "string" && intents.has(value)
    ? `action-${value}`
    : "invalid-action";
}
