"use client";
import Link from "next/link";
import { useActionState } from "react";
import { operationAction } from "@/app/operation-actions";
export function ActionForm({
  intent,
  children,
  label = "Save",
  className = "",
  showSubmit = true,
  handler = operationAction,
}: {
  intent: string;
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
