const providerProxyUrl = /https?:\/\/open\.jejudatahub\.net\/api\/proxy\/[^\s"'<>]+/gi

export function sanitizeProviderFailureReason(
  reason: string | null | undefined,
  endpoint = process.env.JEJUDATAHUB_DATASET_URL,
  apiKey = process.env.JEJUDATAHUB_API_KEY,
) {
  let sanitized = reason || '데이터 갱신에 실패했어요.'
  const encodedKey = apiKey ? encodeURIComponent(apiKey) : null
  for (const secret of [apiKey, encodedKey, endpoint].filter((value): value is string => Boolean(value))) {
    sanitized = sanitized.replaceAll(secret, '[숨김]')
  }
  return sanitized
    .replace(providerProxyUrl, '[제주데이터허브 요청 주소 숨김]')
    .replace(/(?:authorization|x-api-key|project[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '[인증 정보 숨김]')
    .slice(0, 500)
}
