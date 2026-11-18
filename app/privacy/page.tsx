import type { Metadata } from "next";
import Storefront from "../storefront";
export const metadata: Metadata = {
  title: "Privacy policy | Discount Mobility Scooters",
  description: "How Discount Mobility Scooters uses the information you provide in a personal quote request.",
  alternates: { canonical: "/privacy" },
};
export default function PrivacyPage(){return <Storefront initialInfo="Privacy policy"/>;}
