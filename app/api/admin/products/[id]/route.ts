import { failure, json, rateLimit, readJson, requireAdmin } from "@/lib/server/http";
import { readProducts, saveProduct } from "@/lib/server/store";
import { RequestError, validateProduct } from "@/lib/server/validation";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const data = await readJson(request, 48_000);
    await rateLimit(request, "admin-write", 100, user.userId);
    const { id } = await context.params;
    const products = await readProducts(true);
    if (!products.some(row => row.id === id)) throw new RequestError("Product not found.", 404);
    const product = validateProduct(data, id);
    if (products.some(row => row.id !== id && row.slug === product.slug)) throw new RequestError("A product already uses that URL slug.", 409);
    await saveProduct(product);
    return json({ product });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    await readJson(request);
    await rateLimit(request, "admin-write", 100, user.userId);
    const { id } = await context.params;
    const product = (await readProducts(true)).find(row => row.id === id);
    if (!product) throw new RequestError("Product not found.", 404);
    await saveProduct({ ...product, active: false });
    return json({ archived: true });
  } catch (error) { return failure(error); }
}
