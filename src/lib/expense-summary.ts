import { db } from "./db";
import { authorize, can, type Actor } from "./permissions";
import { manilaDay } from "./stay-status";
export function manilaMonthRange(now = new Date()) {
  const month = manilaDay(now).slice(0, 7);
  const [year, n] = month.split("-").map(Number);
  return {
    month,
    gte: new Date(`${month}-01T00:00:00+08:00`),
    lt: new Date(Date.UTC(year, n, 1) - 8 * 60 * 60 * 1000),
  };
}
export async function expenseSummary(actor: Actor) {
  authorize(actor, "expense:submit");
  const range = manilaMonthRange();
  const groups = await db.expense.groupBy({
    by: ["status"],
    where: {
      incurredAt: { gte: range.gte, lt: range.lt },
      ...(can(actor.role, "finance") ? {} : { recordedById: actor.id }),
    },
    _sum: { amount: true },
  });
  return {
    month: range.month,
    approved: Number(
      groups.find((g) => g.status === "APPROVED")?._sum.amount ?? 0,
    ),
    submitted: Number(
      groups.find((g) => g.status === "SUBMITTED")?._sum.amount ?? 0,
    ),
  };
}
