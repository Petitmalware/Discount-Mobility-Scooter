import { failure, json, requireAdmin } from "@/lib/server/http";
import { readInquiries } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireAdmin(); return json({ inquiries: await readInquiries() }); }
  catch (error) { return failure(error); }
}
