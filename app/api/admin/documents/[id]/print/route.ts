import { failure, jsonHeaders, requireAdmin } from "@/lib/server/http";
import { documentPreview } from "@/lib/server/communications";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request);
    const { id } = await context.params;
    const { preview } = await documentPreview(id);
    return new Response(preview.html, { headers: {
      ...jsonHeaders, "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    } });
  } catch (error) { return failure(error); }
}
