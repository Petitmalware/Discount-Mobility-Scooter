import type { Inquiry, InquiryInput } from "../types";

export function sameInquiryRequest(input: InquiryInput, saved: Inquiry, paymentPreference: InquiryInput["paymentPreference"]): boolean {
  const fields = ["name", "email", "phone", "addressLine1", "addressLine2", "city", "state", "postcode", "country", "message"] as const;
  return fields.every(field => (input[field] ?? "") === (saved[field] ?? "")) &&
    saved.paymentPreference === paymentPreference &&
    JSON.stringify(input.items) === JSON.stringify(saved.items.map(({ productId, quantity }) => ({ productId, quantity })));
}
