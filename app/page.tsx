import type { Metadata } from "next";
import Storefront from "./storefront";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default function Home() { return <Storefront />; }
