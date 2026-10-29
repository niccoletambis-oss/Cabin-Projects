import { withApiHeaders } from "@/lib/api-response";
export const dynamic = "force-dynamic";
function handleGET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiHeaders(handleGET);
