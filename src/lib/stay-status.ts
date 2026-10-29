export const stayConditions = [
  "GOOD",
  "MINOR_DAMAGE",
  "DAMAGED",
  "MISSING",
  "STAINED",
] as const;
export function inspectionFlags(
  expected: number,
  actual: number,
  condition: string,
  baselineQuantity: number | null,
  baselineCondition: string | null,
) {
  const flags: string[] = [];
  const baseline = baselineQuantity ?? expected;
  if (actual < expected) flags.push("Shortage");
  if (actual < baseline || condition === "MISSING") flags.push("Missing Item");
  if (condition === "STAINED") flags.push("Stained Item");
  if (["DAMAGED", "MINOR_DAMAGE"].includes(condition))
    flags.push("Damaged Item");
  const rank: Record<string, number> = {
    GOOD: 0,
    MINOR_DAMAGE: 1,
    STAINED: 2,
    DAMAGED: 3,
    MISSING: 4,
  };
  if (
    baselineCondition &&
    (rank[condition] ?? 0) > (rank[baselineCondition] ?? 0)
  )
    flags.push("New Damage");
  return flags.length ? flags : ["Complete"];
}
export function manilaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
