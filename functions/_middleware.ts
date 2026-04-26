// 全局中间件：注入 requestId、安全 headers、限制 POST body 大小。
// 与 Express 后端 server/index.mjs 行为对齐。

import { jsonError } from './_lib.ts'

const MAX_BODY_BYTES = 64 * 1024

export const onRequest: PagesFunction = async (context) => {
  const incoming = context.request.headers.get('x-request-id')?.trim()
  const requestId = incoming && incoming.length > 0 ? incoming : `req_${crypto.randomUUID()}`

  context.data.requestId = requestId

  if (context.request.method === 'POST') {
    const contentLength = Number(context.request.headers.get('content-length') || 0)

    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      const response = jsonError(413, 'INVALID_REQUEST', '请求体不能超过 64KB', requestId)
      applySecurityHeaders(response, requestId)
      return response
    }
  }

  const response = await context.next()
  applySecurityHeaders(response, requestId)
  return response
}

function applySecurityHeaders(response: Response, requestId: string): void {
  response.headers.set('X-Request-Id', requestId)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site')
}
