import { failure, json, requireAdmin } from "@/lib/server/http";
import { readInquiries } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireAdmin(request); return json({ inquiries: await readInquiries() }); }
  catch (error) { return failure(error); }
}
