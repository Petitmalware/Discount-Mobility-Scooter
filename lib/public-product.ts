import type {Product, PublicProduct} from "./types";

// Only customer catalog fields may cross the public API or server/client boundary.
export function publicProduct(product:Product):PublicProduct {
  return {
    id:product.id, slug:product.slug, name:product.name, brand:product.brand,
    category:product.category, categories:product.categories, price:product.price,
    description:product.description, image:product.image, images:product.images,
    imageDetails:product.imageDetails, rangeMiles:product.rangeMiles,
    maxSpeedMph:product.maxSpeedMph, capacityLb:product.capacityLb,
    weightLb:product.weightLb, featured:product.featured,
    availability:product.availability, active:product.active,
  };
}
