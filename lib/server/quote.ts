import type { InquiryInput, InquiryItem, Product } from "../types";
import { RequestError } from "./validation";

export function quoteItems(items: InquiryInput["items"], products: Product[]): { items: InquiryItem[]; subtotal: number } {
  const quoted = items.map(item => {
    const product = products.find(row => row.id === item.productId && row.active);
    if (!product || product.availability === "unavailable") throw new RequestError("One of the selected scooters is no longer available. Please update your cart.", 409);
    return { productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price };
  });
  return { items: quoted, subtotal: Math.round(quoted.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100 };
}
