"use client";
import { staffMessage } from "@/lib/staff-message";
import { useActionState, useEffect, useRef, useState, useId } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import { inventoryAction } from "@/app/actions";
type Choice = { id: string; name: string };
export function InventoryForm({
  categories,
  locations,
  items,
  compact = false,
  canEdit = false,
}: {
  categories: Choice[];
  locations: Choice[];
  items: Choice[];
  compact?: boolean;
  canEdit?: boolean;
}) {
  const messageId = useId();
  const [mode, setMode] = useState<"add" | "IN" | "OUT" | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: { success: boolean; message: string }, data: FormData) => {
      const result = await inventoryAction(previous, data);
      setShowMessage(true);
      return result;
    },
    { success: false, message: "" },
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) form.current?.reset();
  }, [state]);
  function open(value: "add" | "IN" | "OUT") {
    setShowMessage(false);
    setMode(value);
    dialog.current?.showModal();
  }
  return (
    <>
      <div className={compact ? "quick-actions" : "action-row"}>
        {canEdit && (
          <button className="button primary" onClick={() => open("add")}>
            <Plus size={18} />
            Add item
          </button>
        )}
        <button
          className="button"
          disabled={!items.length}
          onClick={() => open("IN")}
        >
          <ArrowDownLeft size={18} />
          Stock in
        </button>
        <button
          className="button"
          disabled={!items.length}
          onClick={() => open("OUT")}
        >
          <ArrowUpRight size={18} />
          Stock out
        </button>
      </div>
      <dialog
        aria-labelledby="inventory-dialog-title"
        ref={dialog}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClose={() => setMode(null)}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">INVENTORY</span>
            <h2 id="inventory-dialog-title">
              {mode === "add"
                ? "Add a new item"
                : mode === "IN"
                  ? "Receive stock"
                  : "Take stock out"}
            </h2>
          </div>
          <button
            aria-label="Close dialog"
            className="icon-button"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {mode && (
          <form
            ref={form}
            action={action}
            key={mode}
            aria-busy={pending}
            aria-describedby={
              showMessage && state.message ? messageId : undefined
            }
          >
            <input
              type="hidden"
              name="intent"
              value={mode === "add" ? "add" : "stock"}
            />
            {mode === "add" ? (
              <>
                <label>
                  Item name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="e.g. White bath towels"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    SKU
                    <input
                      name="sku"
                      required
                      minLength={2}
                      maxLength={40}
                      pattern="[a-zA-Z0-9_-]+"
                      placeholder="LIN-004"
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      name="unit"
                      required
                      maxLength={20}
                      defaultValue="pcs"
                    />
                  </label>
                  <label>
                    Category
                    <select name="categoryId" required>
                      <option value="">Select category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Location / room
                    <select name="locationId" required>
                      <option value="">Select location</option>
                      {locations.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Opening quantity
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      max="1000000"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <label>
                    Low stock threshold
                    <input
                      name="minimumStock"
                      type="number"
                      min="0"
                      max="1000000"
                      defaultValue="5"
                      required
                    />
                  </label>
                </div>
                <label>
                  Unit cost (PHP)
                  <input
                    name="unitCost"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <input type="hidden" name="type" value={mode} />
                <label>
                  Inventory item
                  <select name="itemId" required>
                    <option value="">Choose an item</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max="1000000"
                    required
                    placeholder="Enter quantity"
                  />
                </label>
                <label>
                  Reason / note
                  <textarea
                    name="note"
                    minLength={3}
                    maxLength={240}
                    required
                    placeholder={
                      mode === "IN"
                        ? "e.g. Delivery from supplier"
                        : "e.g. Guest supplies for Room 01"
                    }
                  />
                </label>
              </>
            )}
            {showMessage && state.message && (
              <p
                id={messageId}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={
                  state.success ? "form-message success" : "form-message"
                }
              >
                {staffMessage(state.message)}
              </p>
            )}
            <div className="dialog-footer">
              <button
                type="button"
                className="button"
                disabled={pending}
                onClick={() => dialog.current?.close()}
              >
                Done / close
              </button>
              <button className="button primary" disabled={pending}>
                {pending
                  ? "Saving…"
                  : mode === "add"
                    ? "Save item"
                    : "Save stock movement"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
