import data from "./catalog-data.json";
import type {Product} from "./types";

const categoryKey = (value:string) => value.toLowerCase().replaceAll(" ","-");
export const seedProducts:Product[] = (data as Product[]).map(product=>({
  ...product,
  category:categoryKey(product.category),
  categories:product.categories.map(categoryKey),
}));
