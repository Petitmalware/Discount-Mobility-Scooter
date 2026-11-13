import { failure, json, rateLimit, readJson, requireAdmin } from "@/lib/server/http";
import { readSettings, saveSettings } from "@/lib/server/store";
import { validateSettings } from "@/lib/server/validation";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireAdmin(); return json({ settings: await readSettings() }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    const user = await requireAdmin();
    const settings = validateSettings(await readJson(request));
    await rateLimit(request, "admin-write", 100, user.userId);
    await saveSettings(settings);
    return json({ settings });
  } catch (error) { return failure(error); }
}
