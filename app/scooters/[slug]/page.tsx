import Storefront from "../../storefront";
export default async function ScooterPage({params}: {params: Promise<{slug:string}>}) {
  const {slug} = await params;
  return <Storefront initialSlug={slug} />;
}
