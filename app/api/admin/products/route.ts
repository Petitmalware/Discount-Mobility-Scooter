import { failure, json, rateLimit, readJson, requireAdmin } from "@/lib/server/http";
import { readProducts, saveProduct } from "@/lib/server/store";
import { RequestError, validateProduct } from "@/lib/server/validation";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireAdmin(); return json({ products: await readProducts(true) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const data = await readJson(request);
    await rateLimit(request, "admin-write", 100, user.userId);
    const product = validateProduct(data);
    const products = await readProducts(true);
    if (products.length >= 500) throw new RequestError("The catalog has reached its 500 product limit.");
    if (products.some(row => row.slug === product.slug)) throw new RequestError("A product already uses that URL slug.", 409);
    await saveProduct(product);
    return json({ product }, 201);
  } catch (error) { return failure(error); }
}
