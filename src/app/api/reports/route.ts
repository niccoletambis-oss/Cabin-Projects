import { withApiHeaders } from "@/lib/api-response";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { operationalReport, reportCsv } from "@/lib/operational-reports";
async function handleGET(request: Request) {
  const actor = await currentUser();
  if (!actor) return new Response("Authentication required", { status: 401 });
  if (!can(actor.role, "reports"))
    return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "csv";
  if (!["csv", "excel-csv"].includes(format))
    return new Response("Unsupported export format", { status: 400 });
  try {
    const report = await operationalReport(
      actor,
      Object.fromEntries(params.entries()),
    );
    return new Response(
      reportCsv(report.columns, report.rows, format === "excel-csv"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${report.query.type}.csv"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(
      "Invalid filters or report exceeds 5,000 rows. Narrow your filters.",
      { status: 400 },
    );
  }
}

export const GET = withApiHeaders(handleGET);
