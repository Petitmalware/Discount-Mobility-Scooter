export function adminPolicy(email: string | null | undefined, configured: string | null | undefined) {
  const allowlist = (configured ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return { configured: allowlist.length > 0, authorized: Boolean(email && allowlist.includes(email.toLowerCase())) };
}
