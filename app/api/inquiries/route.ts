import type { Inquiry } from "@/lib/types";
import { failure, json, rateLimit, readJson } from "@/lib/server/http";
import { database, readProducts, readSettings, saveInquiry } from "@/lib/server/store";
import { RequestError, validateInquiry } from "@/lib/server/validation";
import { quoteItems } from "@/lib/server/quote";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { notifyInquiry } from "@/lib/server/communications";
import { sameInquiryRequest } from "@/lib/server/inquiry-request";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const data = validateInquiry(await readJson(request, 12_000));
    const user = await getChatGPTUser();
    await rateLimit(request, "inquiry", 5, user?.userId);
    const [products, settings] = await Promise.all([readProducts(), readSettings()]);
    const { items, subtotal } = quoteItems(data.items, products);
    const cryptoReady = data.paymentPreference === "btc" ? settings.btcEnabled && Boolean(settings.btcAddress)
      : data.paymentPreference === "usdt" ? settings.usdtEnabled && Boolean(settings.usdtAddress && settings.usdtNetwork) : true;
    const paymentPreference = cryptoReady ? data.paymentPreference : "assisted";
    const id = data.requestId ?? crypto.randomUUID();
    const prior = data.requestId ? await database().prepare("SELECT data, status FROM inquiries WHERE id = ?").bind(id).first<{ data: string; status: Inquiry["status"] }>() : null;
    const saved = prior ? { ...JSON.parse(prior.data), status: prior.status } as Inquiry : null;
    if (saved && !sameInquiryRequest(data, saved, paymentPreference)) throw new RequestError("This request was already saved with different details. Please start a new quote request.", 409);
    const inquiry: Inquiry = saved ?? {
      id, reference: `DMS-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`, createdAt: new Date().toISOString(),
      name: data.name, email: data.email, phone: data.phone ?? "", postcode: data.postcode ?? "", message: data.message ?? "",
      addressLine1: data.addressLine1, addressLine2: data.addressLine2 ?? "", city: data.city, state: data.state, country: data.country,
      paymentPreference, items, subtotal, currency: settings.currency, status: "new",
    };
    if (!saved) await saveInquiry(inquiry);
    // The inquiry is durable before email is attempted. Delivery failures must
    // never turn a saved customer request into a failed checkout or duplicate.
    let emailNotification: "sent" | "pending" | "unavailable" = "pending";
    try { emailNotification = await notifyInquiry(inquiry, settings); } catch { /* Admin can retry from the saved inquiry. */ }
    return json({
      reference: inquiry.reference, subtotal: inquiry.subtotal, currency: inquiry.currency, paymentPreference: inquiry.paymentPreference, emailNotification,
      message: cryptoReady
        ? "Your quote request has been saved. The store will confirm availability, delivery and payment instructions before you pay."
        : "Your quote request has been saved for payment assistance. Contact the store with your reference to discuss an available payment option.",
    }, saved ? 200 : 201);
  } catch (error) { return failure(error); }
}
