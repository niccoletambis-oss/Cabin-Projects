"use server";
import { actionContext } from "@/lib/action-context";
import { setBookingPrivacy } from "@/lib/privacy";
import { requireUser } from "@/lib/auth";
import { mutationContext } from "@/lib/mutation-context";
import { readAttachment } from "@/lib/uploads";
import { attachPrivateEvidence, archiveFile } from "@/lib/private-evidence";
import { ApplicationError } from "@/lib/application-error";
import { RateLimitError } from "@/lib/rate-limit";
import { captureError } from "@/lib/observability";
import { revalidatePath } from "next/cache";
export async function securityAction(
  _state: { success: boolean; message: string },
  form: FormData,
) {
  const actor = await requireUser();
  try {
    await mutationContext(actor.id);
    const get = (key: string) => String(form.get(key) ?? "");
    if (get("intent") === "private-evidence")
      await attachPrivateEvidence(
        actor,
        {
          purchaseId: get("purchaseId") || null,
          bookingId: get("bookingId") || null,
          locationId: get("locationId") || null,
        },
        await readAttachment(form.get("file"), !!get("purchaseId")),
      );
    else if (["archive-file", "restore-file"].includes(get("intent")))
      await archiveFile(
        actor,
        get("id"),
        get("password"),
        get("intent") === "restore-file",
      );
    else if (get("intent") === "booking-privacy") {
      const action = get("privacyAction");
      if (!["archive", "restore", "hold", "release"].includes(action))
        throw new ApplicationError("Invalid privacy action.");
      await setBookingPrivacy(
        actor,
        get("id"),
        get("password"),
        action as "archive" | "restore" | "hold" | "release",
      );
    } else throw new ApplicationError("Unknown operation.");
    revalidatePath("/", "layout");
    return { success: true, message: "Saved successfully." };
  } catch (error) {
    if (error instanceof ApplicationError || error instanceof RateLimitError)
      return { success: false, message: error.message };
    const id = await captureError(actionContext(form.get("intent")), error);
    return {
      success: false,
      message: `Could not save. Please retry. Reference ${id}`,
    };
  }
}
