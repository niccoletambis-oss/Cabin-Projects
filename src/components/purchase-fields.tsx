import { Field } from "./fields";
import { money } from "@/lib/format";
export function PurchaseFields({
  items,
  suppliers,
}: {
  items: { id: string; name: string; quantity: number; unitCost: number }[];
  suppliers: { id: string; name: string }[];
}) {
  return (
    <>
      <Field
        label="Supplier"
        name="supplierId"
        options={[{ id: "", name: "Select active supplier" }, ...suppliers]}
        required
      />
      <Field
        label="Request status"
        name="status"
        options={["DRAFT", "FOR_APPROVAL"]}
      />
      <p>Select items and confirm order quantities and prices before saving.</p>
      <div className="record-grid">
        {items.map((i) => (
          <section className="selection-card" key={i.id}>
            <label className="check-label">
              <input type="checkbox" name="selected" value={i.id} />
              {i.name}
            </label>
            <small>Unit price {money(i.unitCost)}</small>
            <div className="form-grid">
              <Field
                label="Order quantity"
                name={`quantity-${i.id}`}
                type="number"
                value={i.quantity}
              />
              <Field
                label="Unit cost (PHP)"
                name={`cost-${i.id}`}
                type="number"
                value={i.unitCost}
              />
            </div>
          </section>
        ))}
      </div>
      <Field label="Notes" name="notes" type="textarea" />
    </>
  );
}
