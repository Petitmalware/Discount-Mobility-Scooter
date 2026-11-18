import { adminIdentity, failure, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const identity = await adminIdentity(request);
    return json({ authorized: identity.authorized, configured: identity.configured, mode: identity.mode, email: identity.user?.email ?? null });
  } catch (error) { return failure(error); }
}
