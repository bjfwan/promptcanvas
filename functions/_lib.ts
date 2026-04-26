// Cloudflare Pages Functions 共享工具：仅做 JSON 错误响应封装。
// 业务校验与错误映射统一来自 server/lib.mjs。

export interface JsonErrorBody {
  error: {
    code: string
    message: string
  }
  requestId?: string
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  requestId?: string,
): Response {
  const body: JsonErrorBody = { error: { code, message } }

  if (requestId) {
    body.requestId = requestId
  }

  return Response.json(body, { status })
}
