import { publicSettings, readProducts, readSettings } from "@/lib/server/store";
import { failure, json } from "@/lib/server/http";
import { publicProduct } from "@/lib/public-product";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [products, settings] = await Promise.all([readProducts(), readSettings()]);
    return json({ products: products.map(publicProduct), settings: publicSettings(settings) });
  } catch (error) { return failure(error); }
}
