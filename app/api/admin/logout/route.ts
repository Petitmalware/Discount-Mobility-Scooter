import { clearAdminSessionCookie } from "@/lib/server/admin-auth";
import { failure, json, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await readJson(request, 1_024);
    const response = json({ authorized: false });
    response.headers.set("Set-Cookie", clearAdminSessionCookie());
    return response;
  } catch (error) { return failure(error); }
}
