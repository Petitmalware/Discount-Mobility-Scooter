"use client";

import { useState, type FormEvent } from "react";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Sign-in is temporarily unavailable. Please try again.");
      form.reset();
      window.location.replace("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in is temporarily unavailable. Please try again.");
      setBusy(false);
    }
  }

  return <section className="adm-gate">
    <span className="adm-eyebrow">STORE MANAGEMENT</span>
    <h1>Welcome back.</h1>
    <p>Sign in to manage your scooters, customer requests and store settings.</p>
    {configured ? <form className="adm-login" onSubmit={signIn}>
      <label htmlFor="admin-email">Email address</label>
      <input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy} />
      <label htmlFor="admin-password">Password</label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy} />
      {error && <p className="adm-alert adm-error" role="alert">{error}</p>}
      <button className="adm-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
    </form> : <p role="status">Store administration is temporarily unavailable. Please try again later.</p>}
    <p className="adm-muted">Authorized store administrators only.</p>
  </section>;
}
