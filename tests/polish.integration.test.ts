import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import { expenseSummary, manilaMonthRange } from "../src/lib/expense-summary";
import { pageQuery } from "../src/lib/pagination";
import { validateUpload } from "../src/lib/storage/validation";
import sharp from "sharp";
test("Phase 5 bounded histories keep decimal monthly totals and caretaker scope", async () => {
  const f = await stayFixture();
  try {
    const range = manilaMonthRange();
    await db.expense.createMany({
      data: [
        ...Array.from({ length: 51 }, (_, i) => ({
          description: `${f.prefix} Unicode José – 客室 ${i}`,
          amount: "0.10",
          recordedById: f.caretaker.id,
          status: "APPROVED" as const,
          incurredAt: range.gte,
        })),
        {
          description: f.prefix + " another caretaker",
          amount: "0.20",
          recordedById: f.other.id,
          status: "APPROVED",
          incurredAt: range.gte,
        },
        {
          description: f.prefix + " future month",
          amount: "999.99",
          recordedById: f.caretaker.id,
          status: "APPROVED",
          incurredAt: range.lt,
        },
      ],
    });
    const own = await expenseSummary(f.caretaker);
    assert.equal(own.approved, 5.1);
    assert.equal((await expenseSummary(f.other)).approved, 0.2);
    await assert.rejects(expenseSummary(null as never), /Authentication/);
    const page1 = await db.expense.findMany({
      where: { recordedById: f.caretaker.id },
      orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
      ...pageQuery(1),
    });
    const page2 = await db.expense.findMany({
      where: { recordedById: f.caretaker.id },
      orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
      ...pageQuery(2),
    });
    assert.equal(page1.length, 51);
    assert.equal(page2.length, 2);
    assert.equal(
      new Set([...page1.slice(0, 50), ...page2].map((e) => e.id)).size,
      52,
    );
    const img = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const normalized = await validateUpload({
      data: img,
      contentType: "image/png",
      originalName: 'José’s room (客室) "photo".png',
    });
    assert.match(normalized.originalName, /客室/);
    assert.equal(normalized.contentType, "image/webp");
  } finally {
    await cleanupStay(f);
    await db.$disconnect();
  }
});
