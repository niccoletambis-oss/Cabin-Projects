import { test, expect } from "@playwright/test";
import { stayFixture, cleanupStay } from "../stay-fixtures";
import { db } from "../../src/lib/db";
import { requestPasswordReset } from "../../src/lib/password-reset";
test("mobile account recovery, strict headers and private evidence", async ({
  page,
}) => {
  const f = await stayFixture();
  try {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy/i.test(message.text())
      )
        violations.push(message.text());
    });
    const response = await page.goto("/login");
    expect(response?.headers()["content-security-policy"]).toContain(
      "strict-dynamic",
    );
    expect(response?.headers()["referrer-policy"]).toBe("strict-origin");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.getByLabel("Email", { exact: true }).fill(f.admin.email);
    await page.getByRole("button", { name: "Request reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If an active account matches",
    );
    let url = "";
    await requestPasswordReset(f.admin.email, (message) => {
      url = message.url;
    });
    await page.goto(new URL(url).pathname + new URL(url).search);
    await page
      .getByLabel("New password (15–128 characters)", { exact: true })
      .fill(f.password);
    await page.getByLabel("Confirm new password").fill(f.password);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await page.getByLabel("Email", { exact: true }).fill(f.admin.email);
    await page.getByLabel("Password", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/");
    await page.goto(`/rooms/${f.room.id}`);
    await page.getByLabel(/Photo.*up to 2 MB/).setInputFiles({
      name: "room.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
        "base64",
      ),
    });
    await page.getByRole("button", { name: "Attach evidence" }).click();
    await expect(page.getByRole("status")).toContainText("Saved successfully");
    await expect(page.getByRole("link", { name: "room.png" })).toBeVisible();
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await db.privateAttachment.deleteMany({
      where: { storedFile: { createdById: { in: f.users.map((u) => u.id) } } },
    });
    await cleanupStay(f);
    await db.$disconnect();
  }
});
