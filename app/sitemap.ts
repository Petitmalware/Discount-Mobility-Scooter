import type { MetadataRoute } from "next";
import { readProducts } from "@/lib/server/store";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await readProducts();
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/privacy` },
    ...products.map(product => ({ url: `${SITE_URL}/scooters/${product.slug}` })),
  ];
}
