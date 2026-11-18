import { failure, json } from "@/lib/server/http";
import { communicationBody } from "@/lib/server/communication-http";
import { customMessagePreview } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const data = await communicationBody(request, "preview", 36_000); return json({ preview: (await customMessagePreview((await context.params).id, data)).preview }); } catch (error) { return failure(error); }
}
