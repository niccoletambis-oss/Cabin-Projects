import { headers } from "next/headers";
import { sameOrigin, requestOrigin } from "./request-origin";
import { enforceRate, rateLimitValue } from "./rate-limit";
import { requestId } from "./observability";
export async function mutationContext(userId: string) {
  const incoming = await headers();
  const request = new Request(
    requestOrigin(
      new Request("http://internal.invalid", { headers: incoming }),
    ),
    { headers: incoming },
  );
  if (!sameOrigin(request)) throw new Error("Invalid request origin");
  await enforceRate(
    "mutation",
    userId,
    rateLimitValue("RATE_LIMIT_MUTATION", 120),
    60000,
  );
  return { requestId: requestId(incoming.get("x-request-id")) };
}
