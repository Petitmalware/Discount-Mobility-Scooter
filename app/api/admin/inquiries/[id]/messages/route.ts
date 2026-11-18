import { failure, json } from "@/lib/server/http";
import { communicationBody, confirmSend } from "@/lib/server/communication-http";
import { sendCustomMessage } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const data = await communicationBody(request, "send", 36_000); confirmSend(data); return json(await sendCustomMessage((await context.params).id, data)); } catch (error) { return failure(error); }
}
