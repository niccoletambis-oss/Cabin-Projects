import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stayFixture, cleanupStay } from "../stay-fixtures";
import { db } from "../../src/lib/db";
let f: Awaited<ReturnType<typeof stayFixture>>;
test.beforeAll(async () => {
  f = await stayFixture();
});
test.afterAll(async () => {
  await cleanupStay(f);
  await db.$disconnect();
});
for (const [role, routes] of Object.entries({
  ADMIN: [
    "/",
    "/inventory",
    "/users",
    "/suppliers",
    "/purchases",
    "/charges",
    "/expenses",
    "/reports",
    "/reports/operations",
    "/settings/storage",
    "/activity",
  ],
  MANAGER: [
    "/bookings",
    "/inspections",
    "/damage",
    "/expenses/new",
    "/reports/operations",
  ],
  CARETAKER: [
    "/inventory",
    "/linen",
    "/bookings",
    "/inspections",
    "/damage",
    "/expenses/new",
    "/audits",
  ],
})) {
  test(`${role} mobile accessibility and permitted navigation`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const user = f.users.find((u) => u.role === role)!;
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/");
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect
        .soft(
          result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
          route,
        )
        .toEqual([]);
    }
    await page.getByRole("button", { name: "Open navigation" }).click();
    const menu = page.getByRole("dialog", { name: "Navigation" });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    if (role !== "ADMIN") {
      await page.goto("/users");
      await expect(
        page.getByRole("heading", { name: "Access restricted" }),
      ).toBeVisible();
    }
    if (role === "CARETAKER") {
      await page.goto("/reports");
      await expect(
        page.getByRole("heading", { name: "Access restricted" }),
      ).toBeVisible();
      await page.goto("/inventory");
      await expect(
        page.getByRole("button", { name: "Add item", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Stock out", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Take stock out" });
      await expect(dialog).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations.map((v) => v.id),
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    }
  });
}
test("public recovery pages are accessible on a phone", async ({ page }) => {
  for (const route of [
    "/login",
    "/forgot-password",
    "/reset-password?token=" + "0".repeat(64),
  ]) {
    await page.goto(route);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test.describe("Desktop acceptance", () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  test("desktop keyboard navigation, table headers and report scrolling", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.admin.email);
    await page.getByLabel("Password", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/");
    for (const route of ["/", "/inventory", "/reports/operations"]) {
      await page.goto(route);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        route,
      ).toEqual([]);
    }
    await page.goto("about:blank");
    await page.goto("/inventory");
    await expect(
      page.getByRole("heading", { name: "Inventory", exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});
test("mobile confirmation can cancel an irreversible booking action before submission", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(f.manager.email);
  await page.getByLabel("Password", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL("/");
  await page.goto(`/bookings/${f.booking.id}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel upcoming booking" }).click();
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
      .status,
  ).toBe("UPCOMING");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel upcoming booking" }).click();
  await expect
    .poll(
      async () =>
        (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
          .status,
    )
    .toBe("CANCELLED");
});
