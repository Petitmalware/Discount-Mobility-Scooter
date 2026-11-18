import { failure, json } from "@/lib/server/http";
import { communicationBody } from "@/lib/server/communication-http";
import { recordPayment } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const data = await communicationBody(request, "payment", 4_000); return json(await recordPayment((await context.params).id, data), 201); } catch (error) { return failure(error); }
}
