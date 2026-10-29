"use server";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import * as ops from "@/lib/stay-operations";
import { readAttachment } from "@/lib/uploads";
export async function stayAction(
  _previous: { success: boolean; message: string; href?: string },
  form: FormData,
) {
  const actor = await requireUser();
  const get = (key: string) => String(form.get(key) ?? "");
  const data = Object.fromEntries(form.entries());
  let href: string | undefined;
  try {
    switch (get("intent")) {
      case "room": {
        const room = await ops.saveRoom(actor, {
          ...data,
          id: get("id") || null,
          active: get("active") === "true",
          assignees: form.getAll("assignees").map(String),
        });
        href = `/rooms/${room.id}`;
        break;
      }
      case "room-line":
        await ops.saveRoomLine(actor, data);
        break;
      case "linen-register":
        await ops.registerLinen(actor, data);
        break;
      case "linen-move":
        await ops.moveLinen(actor, data);
        break;
      case "booking": {
        const booking = await ops.saveBooking(actor, {
          ...data,
          id: get("id") || null,
          rooms: form.getAll("rooms").map(String),
        });
        href = `/bookings/${booking.id}`;
        break;
      }
      case "booking-cancel":
        await ops.cancelBooking(actor, get("id"));
        break;
      case "inspection-start": {
        const inspection = await ops.startInspection(actor, data);
        href = `/inspections/${inspection.id}`;
        break;
      }
      case "inspection-save":
        await ops.saveInspection(
          actor,
          get("id"),
          {
            notes: get("notes"),
            lines: form.getAll("lineId").map((value) => {
              const id = String(value);
              return {
                id,
                actualQuantity: get(`quantity-${id}`),
                condition: get(`condition-${id}`),
                notes: get(`notes-${id}`),
              };
            }),
          },
          get("complete") === "true",
        );
        break;
      case "inspection-issue": {
        await ops.reportInspectionIssue(actor, data);
        href = "/damage";
        break;
      }
      case "guest-charge": {
        const charge = await ops.createGuestCharge(actor, data);
        href = `/charges/${charge.id}`;
        break;
      }
      case "charge-transition":
        await ops.transitionCharge(
          actor,
          get("id"),
          get("status"),
          get("notes"),
        );
        break;
      case "expense": {
        const expense = await ops.saveExpense(actor, {
          ...data,
          id: get("id") || null,
          supplierId: get("supplierId") || null,
          purchaseId: get("purchaseId") || null,
          damageReportId: get("damageReportId") || null,
          bookingId: get("bookingId") || null,
        });
        href = `/expenses/${expense.id}`;
        break;
      }
      case "expense-review":
        await ops.reviewExpense(actor, get("id"), get("status"));
        break;
      case "attachment":
        await ops.attachEvidence(
          actor,
          {
            inspectionLineId: get("inspectionLineId") || undefined,
            expenseId: get("expenseId") || undefined,
          },
          await readAttachment(form.get("file"), !!get("expenseId")),
        );
        break;
      default:
        throw new ops.StayError("Unknown operation.");
    }
    revalidatePath("/", "layout");
    return { success: true, message: "Saved successfully.", href };
  } catch (error) {
    if (error instanceof ZodError)
      return {
        success: false,
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(". "),
      };
    if (error instanceof ops.StayError)
      return { success: false, message: error.message };
    if (
      error instanceof Error &&
      /^(Permission denied|Authentication required)$/.test(error.message)
    )
      return { success: false, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError)
      return {
        success: false,
        message:
          error.code === "P2002"
            ? "This reference, inspection, issue or charge already exists. Duplicate processing is not allowed."
            : "Unable to save. Check the selected records and try again.",
      };
    return {
      success: false,
      message: "Unable to save. Please retry or contact an Admin.",
    };
  }
}
