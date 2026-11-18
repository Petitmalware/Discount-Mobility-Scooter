import { readJson, rateLimit, requireAdmin } from "./http";
import { recordObject } from "./commerce-documents";
import { RequestError } from "./validation";

export async function communicationBody(request: Request, scope: "draft" | "preview" | "send" | "payment", maxBytes = 32_000) {
  const user = await requireAdmin(request);
  const data = recordObject(await readJson(request, maxBytes));
  await rateLimit(request, `admin-communication-${scope}`, scope === "send" ? 20 : 60, user.userId);
  return data;
}
export function confirmSend(data: Record<string, unknown>) {
  if (data.confirmSend !== true) throw new RequestError("Confirm that this email should be sent to the customer.");
}
