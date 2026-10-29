import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { operationalReport, reportKinds } from "@/lib/operational-reports";
import { ExpenseCategory } from "@prisma/client";
import { Field } from "@/components/fields";
export default async function OperationalReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser("reports");
  const query = await searchParams;
  let report;
  let error = "";
  try {
    report = await operationalReport(user, query);
  } catch {
    error =
      "Invalid filters or report too large. Use valid dates and narrower filters.";
  }
  const [locations, categories, items, bookings, suppliers, users] =
    await Promise.all([
      db.location.findMany({ select: { id: true, name: true } }),
      db.category.findMany({ select: { id: true, name: true } }),
      db.inventoryItem.findMany({ select: { id: true, name: true } }),
      db.booking.findMany({ select: { id: true, reference: true } }),
      db.supplier.findMany({ select: { id: true, name: true } }),
      db.user.findMany({ select: { id: true, name: true } }),
    ]);
  const params = new URLSearchParams(
    Object.entries(query).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
  return (
    <div className="page report-page">
      <h1>Operational reports & exports</h1>
      <p>
        Financial reports are restricted to Admin / Manager. Current-balance
        reports are current state; dates apply to movement, inspection, issue,
        purchase, audit and expense records. Times in exports use ISO UTC;
        monthly groups use Asia/Manila.
      </p>
      <form method="get" className="panel operation-card report-controls">
        <div className="form-grid">
          <Field
            label="Report"
            name="type"
            value={query.type ?? "room-inventory"}
            options={reportKinds.map((type) => ({
              id: type,
              name: type.replaceAll("-", " "),
            }))}
          />
          <Field
            label="From date"
            name="from"
            type="date"
            value={query.from ?? ""}
          />
          <Field label="To date" name="to" type="date" value={query.to ?? ""} />
          <Field
            label="Room / location"
            name="locationId"
            value={query.locationId ?? ""}
            options={[{ id: "", name: "All" }, ...locations]}
          />
          <Field
            label="Category"
            name="categoryId"
            value={query.categoryId ?? ""}
            options={[
              { id: "", name: "All" },
              ...categories,
              ...Object.values(ExpenseCategory).map((c) => ({
                id: c,
                name: `Expense: ${c.replaceAll("_", " ")}`,
              })),
            ]}
          />
          <Field
            label="Item"
            name="itemId"
            value={query.itemId ?? ""}
            options={[{ id: "", name: "All" }, ...items]}
          />
          <Field
            label="Booking"
            name="bookingId"
            value={query.bookingId ?? ""}
            options={[
              { id: "", name: "All" },
              ...bookings.map((b) => ({ id: b.id, name: b.reference })),
            ]}
          />
          <Field
            label="Status (exact status name, optional)"
            name="status"
            value={query.status ?? ""}
          />
          <Field
            label="Supplier"
            name="supplierId"
            value={query.supplierId ?? ""}
            options={[{ id: "", name: "All" }, ...suppliers]}
          />
          <Field
            label="User"
            name="userId"
            value={query.userId ?? ""}
            options={[{ id: "", name: "All" }, ...users]}
          />
        </div>
        <button className="button primary">Apply filters</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <div className="action-row report-controls">
            <Link
              className="button"
              href={`/api/reports?${params.toString()}&format=csv`}
            >
              Download CSV
            </Link>
            <Link
              className="button"
              href={`/api/reports?${params.toString()}&format=excel-csv`}
            >
              Excel-friendly CSV
            </Link>
            <Link
              className="button"
              href={`/reports/operations?${params.toString()}&print=1`}
            >
              Printable view
            </Link>
          </div>
          <p>
            {report.rows.length} rows · {report.query.type.replaceAll("-", " ")}
          </p>
          <section className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  {report.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {query.print === "1" && (
            <p>
              Use your browser’s Print command to print this report. Navigation
              and controls are excluded from print.
            </p>
          )}
        </>
      )}
    </div>
  );
}
