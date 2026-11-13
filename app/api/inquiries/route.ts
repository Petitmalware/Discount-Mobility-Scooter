import type { Inquiry } from "@/lib/types";
import { failure, json, rateLimit, readJson } from "@/lib/server/http";
import { readProducts, readSettings, saveInquiry } from "@/lib/server/store";
import { validateInquiry } from "@/lib/server/validation";
import { quoteItems } from "@/lib/server/quote";
import { getChatGPTUser } from "@/app/chatgpt-auth";

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
    const id = crypto.randomUUID();
    const inquiry: Inquiry = {
      id, reference: `DMS-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`, createdAt: new Date().toISOString(),
      name: data.name, email: data.email, phone: data.phone ?? "", postcode: data.postcode ?? "", message: data.message ?? "",
      paymentPreference, items, subtotal, currency: settings.currency, status: "new",
    };
    await saveInquiry(inquiry);
    return json({
      reference: inquiry.reference, subtotal, currency: settings.currency, paymentPreference,
      message: cryptoReady
        ? "Your quote request has been saved. The store will confirm availability, delivery and payment instructions before you pay."
        : "Your quote request has been saved for payment assistance. Contact the store with your reference to discuss an available payment option.",
    }, 201);
  } catch (error) { return failure(error); }
}
