import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
test("authorized owner can add, receive, and withdraw stock on a phone", async ({
  page,
}) => {
  const sku = `E2E-${Date.now()}`;
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("owner@cabin.example");
    await page.getByLabel("Password", { exact: true }).fill("CabinOwner2026!");
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(
      page.getByRole("heading", { name: "A well-stocked welcome." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".mobile-nav")
      .getByRole("link", { name: "Stock" })
      .click();
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Item name").fill("Browser test towels");
    await dialog.getByLabel("SKU", { exact: true }).fill(sku);
    await dialog
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption({ label: "Linen & Bedding" });
    await dialog
      .getByRole("combobox", { name: "Location / room", exact: true })
      .selectOption({ label: "Linen Room" });
    await dialog.getByLabel("Opening quantity").fill("5");
    await dialog.getByLabel("Low stock threshold").fill("2");
    await dialog
      .getByRole("button", { name: "Save item", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Item added to inventory.",
    );
    await dialog.getByRole("button", { name: "Done / close" }).click();
    await page.getByRole("textbox", { name: "Search inventory" }).fill(sku);
    await expect(
      page.locator(".inventory-card").filter({ hasText: sku }),
    ).toContainText("5");
    for (const [button, quantity, note] of [
      ["Stock in", "3", "Browser delivery"],
      ["Stock out", "2", "Guest room supplies"],
    ]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await dialog
        .getByRole("combobox", { name: "Inventory item", exact: true })
        .selectOption({ label: "Browser test towels" });
      await dialog.getByLabel("Quantity", { exact: true }).fill(quantity);
      await dialog.getByLabel("Reason / note").fill(note);
      await dialog.getByRole("button", { name: "Save stock movement" }).click();
      await expect(dialog.getByRole("status")).toHaveText(
        "Stock updated successfully.",
      );
      await dialog.getByRole("button", { name: "Done / close" }).click();
    }
    const item = await db.inventoryItem.findUniqueOrThrow({ where: { sku } });
    expect(item.quantity).toBe(6);
    await page.getByRole("button", { name: "Stock out", exact: true }).click();
    await dialog
      .getByRole("combobox", { name: "Inventory item", exact: true })
      .selectOption({ label: "Browser test towels" });
    await dialog.getByLabel("Quantity", { exact: true }).fill("7");
    await dialog.getByLabel("Reason / note").fill("Insufficient stock test");
    await dialog.getByRole("button", { name: "Save stock movement" }).click();
    await expect(dialog.getByRole("status")).toContainText("Not enough stock");
    await page.screenshot({
      path: "test-results/mobile-inventory.png",
      fullPage: true,
    });
  } finally {
    const item = await db.inventoryItem.findUnique({ where: { sku } });
    if (item) {
      await db.stockTransaction.deleteMany({ where: { itemId: item.id } });
      await db.activityLog.deleteMany({ where: { entityId: item.id } });
      await db.inventoryItem.delete({ where: { id: item.id } });
    }
  }
});
test.afterAll(async () => {
  await db.$disconnect();
});
