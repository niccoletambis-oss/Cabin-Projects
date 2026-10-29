export function statusTone(status: string) {
  if (
    ["MISSING", "DAMAGED", "REJECTED", "WRITTEN_OFF", "OUT OF STOCK"].includes(
      status,
    )
  )
    return "empty";
  if (
    [
      "APPROVED",
      "RECEIVED",
      "COMPLETED",
      "PAID",
      "CHECKED_IN",
      "GOOD",
      "RESOLVED",
    ].includes(status)
  )
    return "good";
  if (
    [
      "DRAFT",
      "PENDING",
      "SUBMITTED",
      "FOR_REVIEW",
      "FOR_APPROVAL",
      "UNDER_REVIEW",
      "UPCOMING",
      "FOR_REPLACEMENT",
      "FOR_REPAIR",
    ].includes(status)
  )
    return "low";
  return "neutral";
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusTone(status)}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
