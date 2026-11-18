export function isAuthConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim() && (process.env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 32)
}
