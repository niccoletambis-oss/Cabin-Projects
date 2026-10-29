"use client";
import { useActionState } from "react";
import { operationAction } from "@/app/operation-actions";
export function ActionForm({
  intent,
  children,
  label = "Save",
  className = "",
  showSubmit = true,
}: {
  intent: string;
  children: React.ReactNode;
  label?: string;
  className?: string;
  showSubmit?: boolean;
}) {
  const [state, action, pending] = useActionState(operationAction, {
    success: false,
    message: "",
  });
  return (
    <form action={action} className={className}>
      <input type="hidden" name="intent" value={intent} />
      {children}
      {state.message && (
        <p
          role="status"
          className={state.success ? "form-message success" : "form-message"}
        >
          {state.message}
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
