import { RequestError } from "./validation";

export async function readJson(request: Request, maxBytes = 24_000): Promise<unknown> {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new RequestError("This request must be made from the store website.", 403);
  if ((request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError("Expected a JSON request.", 415);
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > maxBytes) throw new RequestError("The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Please provide the request details.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RequestError("The request is too large.", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError("Please provide valid request details."); }
}
