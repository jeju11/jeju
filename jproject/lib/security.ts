export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(':', '')
  if (!host) return origin === new URL(request.url).origin

  return origin === `${protocol}://${host}`
}
