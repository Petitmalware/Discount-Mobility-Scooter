import { failure, json } from "@/lib/server/http";
import { communicationBody, confirmSend } from "@/lib/server/communication-http";
import { sendDocument } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const data = await communicationBody(request, "send", 1_024); confirmSend(data); return json(await sendDocument((await context.params).id)); } catch (error) { return failure(error); }
}
