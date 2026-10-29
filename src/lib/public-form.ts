// Native recovery/login forms use URL encoding. Bound actual bytes, including chunked bodies.
export async function publicForm(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    throw new Error("Invalid form");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid form");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new Error("Form too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const params = new URLSearchParams(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
  const result = new FormData();
  for (const [key, value] of params) result.append(key, value);
  return result;
}
