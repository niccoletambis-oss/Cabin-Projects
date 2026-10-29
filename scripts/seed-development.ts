import "dotenv/config";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DEMO_ACCOUNTS !== "true"
  )
    throw new Error(
      "Development accounts require ALLOW_DEMO_ACCOUNTS=true and cannot be seeded in production",
    );
  for (const [name, email, role, password] of [
    ["Cabin Owner", "owner@cabin.example", "ADMIN", "CabinOwner2026!"],
    ["Cabin Manager", "manager@cabin.example", "MANAGER", "CabinManager2026!"],
    [
      "Cabin Caretaker",
      "caretaker.dev@cabin.example",
      "CARETAKER",
      "CabinCaretaker2026!",
    ],
  ] as const) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) continue;
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, role, passwordHash: await hashPassword(password) },
      });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          role,
          action: "DEV_ACCOUNT_CREATED",
          entityId: user.id,
          details: "Explicit development seed created account",
        },
      });
    });
  }
  console.log(
    "Development accounts created where missing. Existing accounts and passwords preserved.",
  );
}
main().finally(() => db.$disconnect());
