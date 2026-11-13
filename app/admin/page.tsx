import { chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { adminIdentity } from "@/lib/server/http";
import AdminPanel from "./panel";
import "./admin.css";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const { user, authorized, configured } = await adminIdentity();
  return <main className="adm-shell">
    <header className="adm-header"><a href="/" className="adm-brand">DMS<span>Discount Mobility Scooters</span></a><a href="/">← Back to store</a></header>
    {authorized ? <AdminPanel email={user!.email} signOutPath={chatGPTSignOutPath("/")} /> : <section className="adm-gate">
      <span className="adm-eyebrow">STORE MANAGEMENT</span><h1>Welcome to your admin area.</h1>
      {!user ? <><p>Sign in with the ChatGPT account authorized to manage this store.</p><a className="adm-button" href={chatGPTSignInPath("/admin")} target="_top">Sign in with ChatGPT</a></> : <><p>Signed in as <strong>{user.email}</strong>.</p><p>{configured ? "This account does not have administrator access. Ask the store owner to authorize your account." : "Administrator access has not been configured. The owner must set the ADMIN_EMAILS runtime variable to the email address of the ChatGPT account that will manage this store."}</p><a href={chatGPTSignOutPath("/admin")} target="_top">Sign out and use another account</a></>}
      <p className="adm-muted">Catalog changes and customer inquiries are available only to explicitly authorized administrators.</p>
    </section>}
  </main>;
}
