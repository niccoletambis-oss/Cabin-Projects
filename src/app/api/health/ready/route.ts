import { withApiHeaders } from "@/lib/api-response";
import { db } from "@/lib/db";
import { storageProvider } from "@/lib/storage/provider";
import { captureError } from "@/lib/observability";
export const dynamic = "force-dynamic";
let checkedAt = 0;
async function handleGET() {
  try {
    await db.$queryRaw`SELECT 1`;
    if (Date.now() - checkedAt > 5000) {
      await storageProvider().health();
      checkedAt = Date.now();
    }
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const id = await captureError("readiness", error);
    return Response.json(
      { status: "unavailable", requestId: id },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = withApiHeaders(handleGET);
