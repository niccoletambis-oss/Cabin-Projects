import { ActionForm } from "./action-form";
import { stayAction } from "@/app/stay-actions";
export function StayForm({
  children,
  intent,
  label = "Save",
  showSubmit = true,
}: {
  children: React.ReactNode;
  intent: string;
  label?: string;
  showSubmit?: boolean;
}) {
  return (
    <ActionForm
      intent={intent}
      label={label}
      showSubmit={showSubmit}
      handler={stayAction}
    >
      {children}
    </ActionForm>
  );
}
