"use client";
import { staffMessage } from "@/lib/staff-message";
import Link from "next/link";
import { useActionState, useId, useRef, useEffect } from "react";
import { operationAction } from "@/app/operation-actions";
export function ActionForm({
  intent,
  children,
  label = "Save",
  className = "",
  showSubmit = true,
  handler = operationAction,
  confirmation,
}: {
  intent: string;
  confirmation?: string;
  children: React.ReactNode;
  label?: string;
  className?: string;
  showSubmit?: boolean;
  handler?: (
    previous: { success: boolean; message: string; href?: string },
    form: FormData,
  ) => Promise<{ success: boolean; message: string; href?: string }>;
}) {
  const [state, action, pending] = useActionState<
    { success: boolean; message: string; href?: string },
    FormData
  >(handler, {
    success: false,
    message: "",
  });
  const messageId = useId();
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.message && !state.success) message.current?.focus();
  }, [state]);
  const irreversible: Record<string, string> = {
    "booking-cancel": "Cancel this booking? Its history will be preserved.",
    "review-audit":
      "Apply this audit review? Approved stock adjustments cannot be undone here.",
    "expense-review":
      "Review this expense? Reviewed records and receipts become read-only.",
    "archive-file":
      "Archive this file? Eligible evidence is hidden, and its bytes are retained.",
    password: "Change your password and sign out every session?",
  };
  const confirmText = confirmation ?? irreversible[intent];
  return (
    <form
      action={action}
      className={className}
      aria-busy={pending}
      aria-describedby={state.message ? messageId : undefined}
      onSubmit={(event) => {
        const submitted = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        const status = submitted.get("status");
        const text =
          confirmText ??
          (intent === "transition-purchase" && status === "RECEIVED"
            ? "Receive this purchase? Stock will increase once and receiving becomes permanent."
            : intent === "charge-transition" &&
                ["APPROVED", "PAID", "WAIVED"].includes(String(status))
              ? "Confirm this guest charge update? The change will be recorded in its history."
              : undefined);
        if (text && !window.confirm(text)) event.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      {children}
      {state.message && (
        <p
          id={messageId}
          ref={message}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={state.success ? "form-message success" : "form-message"}
        >
          {staffMessage(state.message)}
        </p>
      )}
      {state.success && state.href && (
        <p>
          <Link className="button" href={state.href}>
            Open saved record →
          </Link>
        </p>
      )}
      {showSubmit && (
        <button className="button primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      )}
    </form>
  );
}
