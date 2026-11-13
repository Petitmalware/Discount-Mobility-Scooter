import Storefront from "./storefront";
import {readProducts} from "@/lib/server/store";
import {publicProduct} from "@/lib/public-product";
export const dynamic = "force-dynamic";
export default async function Home() { return <Storefront initialProducts={(await readProducts()).map(publicProduct)} />; }
