export function isOwnerEmail(email: string) {
  const owner = process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS?.split(",")[0];
  return Boolean(owner?.trim()) && owner?.trim().toLowerCase() === email.trim().toLowerCase();
}
