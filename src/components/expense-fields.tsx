import { Field } from "./fields";
import { ExpenseCategory, PaymentMethod } from "@prisma/client";
import { manilaDay } from "@/lib/stay-status";
type Choice = { id: string; name: string };
export function ExpenseFields({
  expense,
  financial,
  bookings,
  suppliers,
  purchases,
  issues,
}: {
  expense?: {
    incurredAt: Date;
    category: string;
    description: string;
    payee: string | null;
    supplierId: string | null;
    amount: unknown;
    paymentMethod: string;
    receiptNumber: string | null;
    purchaseId: string | null;
    damageReportId: string | null;
    bookingId: string | null;
    notes: string | null;
  };
  financial: boolean;
  bookings: Choice[];
  suppliers: Choice[];
  purchases: Choice[];
  issues: Choice[];
}) {
  return (
    <>
      <div className="form-grid">
        <Field
          label="Expense date"
          name="incurredAt"
          type="date"
          value={expense ? manilaDay(expense.incurredAt) : manilaDay()}
          required
        />
        <Field
          label="Expense category"
          name="category"
          options={Object.values(ExpenseCategory)}
          value={expense?.category ?? "OTHER"}
        />
        <Field
          label="Supplier / payee name"
          name="payee"
          value={expense?.payee ?? ""}
        />
        <Field
          label="Amount (PHP)"
          name="amount"
          type="number"
          value={Number(expense?.amount ?? 0)}
          required
        />
        <Field
          label="Payment method"
          name="paymentMethod"
          value={expense?.paymentMethod ?? "CASH"}
          options={Object.values(PaymentMethod)}
        />
        <Field
          label="Receipt number"
          name="receiptNumber"
          value={expense?.receiptNumber ?? ""}
        />
      </div>
      <Field
        label="Description"
        name="description"
        type="textarea"
        value={expense?.description ?? ""}
        required
      />
      <Field
        label="Related booking (optional)"
        name="bookingId"
        value={expense?.bookingId ?? ""}
        options={[{ id: "", name: "No booking" }, ...bookings]}
      />
      {financial && (
        <>
          <Field
            label="Supplier record (optional)"
            name="supplierId"
            value={expense?.supplierId ?? ""}
            options={[{ id: "", name: "No supplier record" }, ...suppliers]}
          />
          <Field
            label="Related purchase request"
            name="purchaseId"
            value={expense?.purchaseId ?? ""}
            options={[{ id: "", name: "No purchase" }, ...purchases]}
          />
          <Field
            label="Related damage report"
            name="damageReportId"
            value={expense?.damageReportId ?? ""}
            options={[{ id: "", name: "No issue" }, ...issues]}
          />
        </>
      )}
      <Field
        label="Notes"
        name="notes"
        type="textarea"
        value={expense?.notes ?? ""}
      />
    </>
  );
}
