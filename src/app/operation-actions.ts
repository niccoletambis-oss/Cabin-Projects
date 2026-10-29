"use server";
import { actionContext } from "@/lib/action-context";
import { mutationContext } from "@/lib/mutation-context";
import { ApplicationError } from "@/lib/application-error";
import { RateLimitError } from "@/lib/rate-limit";
import { captureError } from "@/lib/observability";
import { readAttachment } from "@/lib/uploads";
import { changeOwnPassword } from "@/lib/auth-service";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as ops from "@/lib/operations";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export async function operationAction(
  _previous: { success: boolean; message: string },
  form: FormData,
) {
  const actor = await requireUser();
  const data = Object.fromEntries(form.entries());
  const get = (key: string) => String(form.get(key) ?? "");
  try {
    await mutationContext(actor.id);
    switch (get("intent")) {
      case "password": {
        await changeOwnPassword(actor, get("currentPassword"), get("password"));
        break;
      }
      case "user":
        await ops.saveUser(actor, {
          ...data,
          id: get("id") || undefined,
          active: get("active") === "true",
          password: get("password") || undefined,
        });
        break;
      case "supplier":
        await ops.saveSupplier(actor, {
          ...data,
          id: get("id") || undefined,
          active: get("active") === "true",
        });
        break;
      case "item":
        await ops.editItem(actor, {
          ...data,
          supplierId: get("supplierId") || null,
          datePurchased: get("datePurchased") || null,
        });
        break;
      case "damage": {
        const file = form.get("photo");
        const photo =
          file instanceof File && file.size
            ? await readAttachment(file)
            : undefined;
        await ops.createDamage(
          actor,
          {
            ...data,
            estimatedCost: get("estimatedCost")
              ? Number(get("estimatedCost"))
              : undefined,
          },
          photo,
        );
        break;
      }
      case "review-damage":
        await ops.reviewDamage(actor, data);
        break;
      case "start-audit":
        await ops.startAudit(
          actor,
          get("locationId") || null,
          get("note"),
          get("assigneeId") || undefined,
        );
        break;
      case "complete-audit":
        await ops.completeAudit(
          actor,
          get("id"),
          form.getAll("lineId").map((value) => {
            const id = String(value);
            return {
              id,
              countedQuantity: get(`count-${id}`),
              condition: get(`condition-${id}`),
              remarks: get(`remarks-${id}`),
            };
          }),
        );
        break;
      case "review-audit":
        await ops.reviewAudit(
          actor,
          get("id"),
          get("remarks"),
          get("adjust") === "true",
        );
        break;
      case "purchase":
        await ops.createPurchase(actor, {
          supplierId: get("supplierId"),
          notes: get("notes"),
          status: get("status"),
          lines: form.getAll("selected").map((value) => {
            const id = String(value);
            return {
              itemId: id,
              quantity: get(`quantity-${id}`),
              unitCost: get(`cost-${id}`),
            };
          }),
        });
        break;
      case "transition-purchase":
        await ops.transitionPurchase(actor, get("id"), get("status"));
        break;
      default:
        throw new Error("Unknown operation");
    }
    revalidatePath("/", "layout");
    return { success: true, message: "Saved successfully." };
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
            ? "That email, SKU or reference already exists."
            : "Unable to save. Check the selected records and try again.",
      };
    return {
      success: false,
      message:
        error instanceof Error &&
        /^(Authentication required|Permission denied|Password must|A password is required|You cannot|Keep at least|Photo must|Use a JPEG|No active items|Remarks too long|Audit already completed|All audit lines|Audit must|Explain the review|Inventory changed|Select each item|Supplier is archived|Invalid purchase transition|Purchase status|Purchase already processed|Stock limit|Assigned user|Current password|Unknown operation)/.test(
          error.message,
        )
          ? error.message
          : "Unable to save. Please try again or contact an Admin.",
    };
  }
}
