import { failure, json, requireAdmin } from "@/lib/server/http";
import { communicationBody } from "@/lib/server/communication-http";
import { communicationWorkspace, createDocument } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(request); return json(await communicationWorkspace((await context.params).id)); } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const data = await communicationBody(request, "draft"); return json(await createDocument((await context.params).id, data), 201); } catch (error) { return failure(error); }
}
