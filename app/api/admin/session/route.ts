import { adminIdentity, failure, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const identity = await adminIdentity();
    return json({ authorized: identity.authorized, configured: identity.configured, email: identity.user?.email ?? null });
  } catch (error) { return failure(error); }
}
