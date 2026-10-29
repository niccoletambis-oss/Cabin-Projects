import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
import { stayFixture, cleanupStay } from "../stay-fixtures";
import * as ops from "../../src/lib/stay-operations";
test("mobile caretaker performs arrival, departure, issue reporting, linen movement and expense submission", async ({
  page,
}) => {
  const f = await stayFixture();
  try {
    await ops.registerLinen(f.manager, {
      itemId: f.item.id,
      locationId: f.storage.id,
      quantity: 8,
      notes: "Mobile test registration",
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.caretaker.email);
    await page.getByLabel("Password", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(
      page.getByRole("heading", { name: "A well-stocked welcome." }),
    ).toBeVisible();
    await page.goto(`/bookings/${f.booking.id}`);
    await page
      .getByRole("button", { name: "Open check-in inspection", exact: true })
      .click();
    await page.getByRole("link", { name: "Open saved record →" }).click();
    await expect(
      page.getByRole("heading", { name: "Check-in inspection", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Save as", exact: true })
      .selectOption("true");
    await page
      .getByRole("button", { name: "Save inspection", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved successfully." }),
    ).toBeVisible();
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
        .status,
    ).toBe("CHECKED_IN");
    await page.goto(`/bookings/${f.booking.id}`);
    await page
      .getByRole("button", { name: "Open check-out inspection", exact: true })
      .click();
    await page.getByRole("link", { name: "Open saved record →" }).click();
    await expect(
      page.getByRole("heading", { name: "Check-out inspection", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Actual quantity", { exact: true }).fill("3");
    await page
      .getByRole("combobox", { name: "Condition", exact: true })
      .selectOption("STAINED");
    await page
      .getByRole("combobox", { name: "Save as", exact: true })
      .selectOption("true");
    await page
      .getByRole("button", { name: "Save inspection", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved successfully." }),
    ).toBeVisible();
    await page
      .getByLabel("Description / association notes", { exact: true })
      .fill("Missing towel associated with stay; management review required.");
    await page
      .getByRole("button", { name: "Create associated issue", exact: true })
      .click();
    await expect(
      page.getByText("Issue already associated with this inspection line.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await db.damageReport.count({ where: { bookingId: f.booking.id } }),
    ).toBe(1);
    expect(
      await db.guestCharge.count({ where: { bookingId: f.booking.id } }),
    ).toBe(0);
    const balance = await db.linenBalance.findUniqueOrThrow({
      where: {
        itemId_status_locationId: {
          itemId: f.item.id,
          status: "AVAILABLE",
          locationId: f.storage.id,
        },
      },
    });
    await page.goto("/linen");
    await page
      .getByRole("combobox", { name: "From balance", exact: true })
      .selectOption(balance.id);
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page
      .getByRole("combobox", { name: "New status", exact: true })
      .selectOption("FOR_LAUNDRY");
    await page
      .getByRole("combobox", { name: "New location", exact: true })
      .selectOption(f.laundry.id);
    await page
      .getByLabel("Movement notes", { exact: true })
      .fill("Used towels sent for laundry");
    await page
      .getByRole("button", { name: "Move quantity", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved successfully." }),
    ).toBeVisible();
    await page.goto("/expenses/new");
    await page
      .getByRole("combobox", { name: "Expense category", exact: true })
      .selectOption("LAUNDRY");
    await page
      .getByLabel("Supplier / payee name", { exact: true })
      .fill("Synthetic Laundry");
    await page.getByLabel("Amount (PHP)", { exact: true }).fill("200");
    await page
      .getByLabel("Description", { exact: true })
      .fill(`${f.prefix} mobile laundry expense`);
    await page
      .getByRole("combobox", {
        name: "Related booking (optional)",
        exact: true,
      })
      .selectOption(f.booking.id);
    await page
      .getByRole("button", { name: "Submit expense", exact: true })
      .click();
    await page.getByRole("link", { name: "Open saved record →" }).click();
    await expect(
      page.getByRole("heading", { name: "Expense details", exact: true }),
    ).toBeVisible();
    await page.getByLabel("JPEG / PNG / WebP / PDF, up to 2 MB").setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG0cAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page
      .getByRole("button", { name: "Attach receipt", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved successfully." }),
    ).toBeVisible();
    expect(
      await db.expense.count({ where: { recordedById: f.caretaker.id } }),
    ).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
        .status,
    ).toBe("CHECKED_OUT");
    expect(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: f.item.id } }))
        .quantity,
    ).toBe(10);
    await page.goto("/charges");
    await expect(
      page.getByRole("heading", { name: "Access restricted" }),
    ).toBeVisible();
  } finally {
    await cleanupStay(f);
  }
});
test.afterAll(async () => db.$disconnect());
