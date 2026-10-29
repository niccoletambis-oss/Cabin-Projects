"use server";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { createItem, moveStock } from "@/lib/inventory";
export type FormState = { success: boolean; message: string };
export async function inventoryAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  try {
    const data = Object.fromEntries(form.entries());
    if (form.get("intent") === "add") await createItem(actor, data);
    else if (form.get("intent") === "stock") await moveStock(actor, data);
    else return { success: false, message: "Invalid inventory action." };
    revalidatePath("/", "layout");
    return {
      success: true,
      message:
        form.get("intent") === "add"
          ? "Item added to inventory."
          : "Stock updated successfully.",
    };
  } catch (error) {
    if (error instanceof ZodError)
      return {
        success: false,
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(". "),
      };
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return {
        success: false,
        message:
          error.code === "P2002"
            ? "That SKU already exists. Use a unique SKU."
            : "Unable to save. Check your category and room, then try again.",
      };
    if (
      error instanceof Error &&
      /stock|Item unavailable|Permission denied|Authentication required/.test(
        error.message,
      )
    )
      return { success: false, message: error.message };
    console.error(
      "Inventory operation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return {
      success: false,
      message: "Could not save. Check the database connection and try again.",
    };
  }
}
