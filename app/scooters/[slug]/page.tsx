import Storefront from "../../storefront";
import {notFound} from "next/navigation";
import {readProducts} from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function generateMetadata({params}: {params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const product=(await readProducts()).find(p=>p.slug===slug);
  return product?{title:`${product.name} | Discount Mobility Scooters`,description:product.description}:{title:"Scooter not found | Discount Mobility Scooters"};
}
export default async function ScooterPage({params}: {params: Promise<{slug:string}>}) {
  const {slug} = await params;
  const products=await readProducts();
  if(!products.some(p=>p.slug===slug))notFound();
  return <Storefront initialSlug={slug} />;
}
