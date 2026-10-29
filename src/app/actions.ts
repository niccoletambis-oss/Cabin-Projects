"use server";
import { actionContext } from "@/lib/action-context";
import { mutationContext } from "@/lib/mutation-context";
import { ApplicationError } from "@/lib/application-error";
import { RateLimitError } from "@/lib/rate-limit";
import { captureError } from "@/lib/observability";
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
    await mutationContext(actor.id);
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
    if (error instanceof ApplicationError || error instanceof RateLimitError)
      return { success: false, message: error.message };
    await captureError(actionContext(form.get("intent")), error);
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

    return {
      success: false,
      message: "Could not save. Check the database connection and try again.",
    };
  }
}
