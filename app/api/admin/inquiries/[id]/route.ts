import { failure, json, rateLimit, readJson, requireAdmin } from "@/lib/server/http";
import { database } from "@/lib/server/store";
import { RequestError } from "@/lib/server/validation";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const data = await readJson(request) as { status?: unknown };
    if (!data || !["new", "contacted", "quoted", "closed"].includes(String(data.status))) throw new RequestError("Choose a valid inquiry status.");
    await rateLimit(request, "admin-write", 100, user.userId);
    const { id } = await context.params;
    const result = await database().prepare("UPDATE inquiries SET status = ? WHERE id = ?").bind(data.status, id).run();
    if (!result.meta.changes) throw new RequestError("Inquiry not found.", 404);
    return json({ updated: true });
  } catch (error) { return failure(error); }
}
