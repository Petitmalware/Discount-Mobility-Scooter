import { failure, json, requireAdmin } from "@/lib/server/http";
import { documentPreview } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(request); return json(await documentPreview((await context.params).id)); } catch (error) { return failure(error); }
}
