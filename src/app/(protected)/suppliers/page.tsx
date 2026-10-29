import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Field, Hidden } from "@/components/fields";
import Link from "next/link";
function SupplierFields({
  supplier,
}: {
  supplier?: {
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
  };
}) {
  return (
    <>
      <Field
        label="Supplier name"
        name="name"
        value={supplier?.name}
        required
      />
      <Field
        label="Contact person"
        name="contactPerson"
        value={supplier?.contactPerson ?? ""}
      />
      <Field label="Mobile number" name="phone" value={supplier?.phone ?? ""} />
      <Field
        label="Email"
        name="email"
        type="email"
        value={supplier?.email ?? ""}
      />
      <Field label="Address" name="address" value={supplier?.address ?? ""} />
      <Field
        label="Notes"
        name="notes"
        type="textarea"
        value={supplier?.notes ?? ""}
      />
      <Field
        label="Status"
        name="active"
        value={String(supplier?.active ?? true)}
        options={[
          { id: "true", name: "Active" },
          { id: "false", name: "Archived / inactive" },
        ]}
      />
    </>
  );
}
export default async function Suppliers() {
  await requireUser("suppliers");
  const suppliers = await db.supplier.findMany({
    include: { purchases: { orderBy: { purchasedAt: "desc" } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="page">
      <h1>Suppliers</h1>
      <p>
        Maintain contacts and purchase history. Archiving preserves all records.
      </p>
      <details className="panel operation-card">
        <summary>Add supplier</summary>
        <ActionForm intent="supplier">
          <SupplierFields />
        </ActionForm>
      </details>
      <div className="record-grid">
        {suppliers.map((s) => (
          <section key={s.id} className="panel operation-card">
            <h2>{s.name}</h2>
            <p>
              {s.active ? "Active" : "Archived"} · {s.contactPerson} · {s.phone}
            </p>
            <p>
              {s.email}
              <br />
              {s.address}
            </p>
            <p>{s.notes}</p>
            <details>
              <summary>Edit / archive supplier</summary>
              <ActionForm intent="supplier">
                <Hidden name="id" value={s.id} />
                <SupplierFields supplier={s} />
              </ActionForm>
            </details>
            <details>
              <summary>Purchase history ({s.purchases.length})</summary>
              {s.purchases.map((p) => (
                <p key={p.id}>
                  <Link href={`/purchases/${p.id}`}>
                    {p.reference} · {p.status}
                  </Link>
                </p>
              ))}
            </details>
          </section>
        ))}
      </div>
    </div>
  );
}
