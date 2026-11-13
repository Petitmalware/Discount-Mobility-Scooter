export type ProductImage = { src: string; alt: string; caption?: string };
export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categories: string[];
  price: number;
  referencePrice: number;
  description: string;
  image: string;
  images: string[];
  imageDetails?: ProductImage[];
  galleryExceptionNote?: string;
  rangeMiles: number;
  maxSpeedMph: number;
  capacityLb: number;
  weightLb: number | null;
  featured: boolean;
  sourceUrl: string;
  priceCheckedAt: string;
  availability: "confirm" | "available" | "unavailable";
  active: boolean;
};

export type Currency = "USD" | "CAD" | "GBP" | "EUR" | "AUD";
export type StoreSettings = {
  email: string;
  phone: string;
  country: string;
  currency: Currency;
  btcEnabled: boolean;
  usdtEnabled: boolean;
  shippingNote: string;
  returnsNote: string;
  btcConfigured: boolean;
  usdtConfigured: boolean;
};
export type AdminStoreSettings = StoreSettings & { btcAddress: string; usdtAddress: string; usdtNetwork: string };

export type InquiryInput = {
  name: string;
  email: string;
  phone?: string;
  postcode?: string;
  message?: string;
  paymentPreference: "assisted" | "btc" | "usdt";
  items: { productId: string; quantity: number }[];
  website?: string;
  consent: boolean;
};

export type InquiryItem = { productId: string; name: string; quantity: number; unitPrice: number };
export type InquiryStatus = "new" | "contacted" | "quoted" | "closed";
export type Inquiry = {
  id: string;
  reference: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  message: string;
  paymentPreference: InquiryInput["paymentPreference"];
  items: InquiryItem[];
  subtotal: number;
  currency: Currency;
  status: InquiryStatus;
};
